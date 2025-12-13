// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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