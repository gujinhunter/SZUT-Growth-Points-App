// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const MAX_BATCH_ADD = 50;
const MAX_POINTS_PER_ADD = 5000;
const MIN_POINTS_PER_ADD = 1;
const MANUAL_RECORD_TITLE = '管理员加分';

class AuthError extends Error {
  constructor(message, code = 'AUTH_DENIED') {
    super(message);
    this.code = code;
  }
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    await ensureAdmin(OPENID);

    const action = event?.action || 'listStudents';
    switch (action) {
      case 'listStudents':
        return { success: true, data: await listStudents(event.payload || {}) };
      case 'getSummary':
        return { success: true, data: await getSummary() };
      case 'batchAddPoints':
        return { success: true, data: await batchAddPoints(OPENID, event.payload || {}) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('adminStatisticsService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后重试'
    };
  }
};

async function ensureAdmin(openid) {
  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ role: true })
    .limit(1)
    .get();
  const user = res.data?.[0];
  if (!user || user.role !== 'admin') {
    throw new AuthError('无管理员权限');
  }
}

async function listStudents({ page = 1, pageSize = 50, keyword = '', order = 'desc' }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const match = { role: _.neq('admin') };
  const conditions = [match];
  if (keyword) {
    const reg = db.RegExp({ regexp: keyword, options: 'i' });
    conditions.push(_.or([
      { name: reg },
      { realName: reg },
      { nickName: reg },
      { studentId: reg },
      { academy: reg },
      { className: reg }
    ]));
  }

  let query = db.collection('users');
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else {
    query = query.where(_.and(conditions));
  }

  const totalRes = await query.count();
  const total = totalRes.total || 0;

  const res = await query
    .orderBy('totalPoints', order === 'asc' ? 'asc' : 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .field({
      name: true,
      realName: true,
      nickName: true,
      studentId: true,
      academy: true,
      className: true,
      major: true,
      totalPoints: true,
      phone: true
    })
    .get();

  // 计算排名：降序时 rank = skip + index + 1，升序时 rank = total - skip - index
  const isDesc = order !== 'asc';
  const skip = (page - 1) * pageSize;
  const list = (res.data || []).map((item, index) => ({
    _id: item._id,
    name: item.name || item.realName || item.nickName || '—',
    studentId: item.studentId || '—',
    academy: item.academy || '',
    className: item.className || '',
    major: item.major || '',
    phone: item.phone || '',
    totalPoints: item.totalPoints || 0,
    rank: isDesc ? (skip + index + 1) : (total - skip - index)
  }));

  return { page, pageSize, total, list };
}

async function getSummary() {
  const usersCollection = db.collection('users');
  const totalRes = await usersCollection.where({ role: _.neq('admin') }).count();
  const totalStudents = totalRes.total || 0;

  const pointsAgg = await usersCollection.aggregate()
    .match({ role: _.neq('admin') })
    .group({
      _id: null,
      totalPoints: _.sum('$totalPoints'),
      maxPoints: _.max('$totalPoints'),
      minPoints: _.min('$totalPoints')
    })
    .end();

  const aggRes = pointsAgg.list?.[0] || { totalPoints: 0, maxPoints: 0, minPoints: 0 };

  return {
    totalStudents,
    totalPoints: aggRes.totalPoints || 0,
    maxPoints: aggRes.maxPoints || 0,
    minPoints: aggRes.minPoints || 0
  };
}

async function batchAddPoints(adminOpenId, payload = {}) {
  const { userIds = [], points: rawPoints, remark = '' } = payload;
  const points = Math.floor(Number(rawPoints));
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new Error('请选择至少一名学生');
  }
  if (userIds.length > MAX_BATCH_ADD) {
    throw new Error(`单次最多为 ${MAX_BATCH_ADD} 名学生加分`);
  }
  if (!Number.isFinite(points) || points < MIN_POINTS_PER_ADD || points > MAX_POINTS_PER_ADD) {
    throw new Error(`分值须为 ${MIN_POINTS_PER_ADD}～${MAX_POINTS_PER_ADD} 的整数`);
  }

  const uniqueIds = [...new Set(userIds.map(id => String(id)).filter(Boolean))];
  const usersCol = db.collection('users');
  const recordsCol = db.collection('manual_point_records');
  const remarkTrim = String(remark || '').trim().slice(0, 200);

  const successes = [];
  const failures = [];

  for (const userId of uniqueIds) {
    try {
      const snap = await usersCol.doc(userId).get();
      const u = snap.data;
      if (!u) {
        failures.push({ userId, reason: '用户不存在' });
        continue;
      }
      if (u.role === 'admin') {
        failures.push({
          userId,
          name: u.name || u.realName || '',
          reason: '不能给管理员加分'
        });
        continue;
      }
      const studentOpenId = u._openid;
      if (!studentOpenId) {
        failures.push({ userId, reason: '缺少用户标识' });
        continue;
      }

      await usersCol.doc(userId).update({ data: { totalPoints: _.inc(points) } });
      await recordsCol.add({
        data: {
          studentOpenId,
          points,
          title: MANUAL_RECORD_TITLE,
          remark: remarkTrim,
          createTime: new Date(),
          adminOpenId
        }
      });
      successes.push({
        userId,
        name: u.name || u.realName || u.nickName || '—'
      });
    } catch (e) {
      console.error('batchAddPoints item error', userId, e);
      failures.push({ userId, reason: e.message || '操作失败' });
    }
  }

  return {
    okCount: successes.length,
    failCount: failures.length,
    successes,
    failures
  };
}