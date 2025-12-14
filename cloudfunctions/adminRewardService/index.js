// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const REWARD_COLLECTION = 'rewards';

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

    const action = event?.action || 'listRewards';
    const payload = event?.payload || {};

    switch (action) {
      case 'listRewards':
        return { success: true, data: await listRewards(payload) };
      case 'saveReward':
        return { success: true, data: await saveReward(payload) };
      case 'deleteReward':
        return { success: true, data: await deleteReward(payload) };
      case 'listRedeemRecords':
        return { success: true, data: await listRedeemRecords(payload) };
      case 'getRedeemSummary':
        return { success: true, data: await getRedeemSummary() };
      case 'updateRedeemStatus':
        return { success: true, data: await updateRedeemStatus(payload) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('adminRewardService error', err);
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

async function listRewards({ page = 1, pageSize = 100, status = '' }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 200);

  let query = db.collection(REWARD_COLLECTION);
  if (status) {
    query = query.where({ status });
  }

  const totalRes = await query.count();
  const total = totalRes.total || 0;

  const res = await query
    .orderBy('sort', 'asc')
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    page,
    pageSize,
    total,
    list: (res.data || []).map(item => ({
      _id: item._id,
      name: item.name || '',
      needPoints: item.needPoints ?? item.requiredPoints ?? item.points ?? 0,
      stock: item.stock ?? null,
      cover: item.cover || '',
      status: item.status || 'enabled',
      description: item.description || '',
      sort: item.sort ?? 0,
      createdAt: item.createdAt || null
    }))
  };
}

async function saveReward(payload) {
  const rewardId = payload.rewardId || payload._id || '';
  const name = (payload.name || '').trim();
  const needPoints = Number(payload.needPoints);
  const stock = payload.stock === '' || payload.stock === undefined || payload.stock === null
    ? null
    : Number(payload.stock);
  const status = payload.status === 'disabled' ? 'disabled' : 'enabled';
  const description = payload.description || '';
  const cover = payload.cover || '';
  const sort = Number(payload.sort) || 0;

  if (!name) {
    throw new Error('请输入奖品名称');
  }
  if (!Number.isFinite(needPoints) || needPoints <= 0) {
    throw new Error('所需积分必须为正数');
  }
  if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
    throw new Error('库存需为非负数');
  }

  const data = {
    name,
    needPoints,
    stock,
    cover,
    status,
    description,
    sort,
    updatedAt: new Date()
  };

  if (rewardId) {
    await db.collection(REWARD_COLLECTION).doc(rewardId).update({ data });
    return { rewardId };
  }

  const addData = {
    ...data,
    createdAt: new Date()
  };
  const addRes = await db.collection(REWARD_COLLECTION).add({ data: addData });
  return { rewardId: addRes._id };
}

async function deleteReward({ rewardId }) {
  if (!rewardId) {
    throw new Error('缺少奖品ID');
  }
  await db.collection(REWARD_COLLECTION).doc(rewardId).remove();
  return { rewardId };
}

async function listRedeemRecords({
  page = 1,
  pageSize = 20,
  status = '',
  rewardId = '',
  keyword = '',
  startTime,
  endTime
}) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const where = {};
  if (status) where.status = status;
  if (rewardId) where.rewardId = rewardId;
  if (startTime || endTime) {
    where.createdAt = {};
    if (startTime) where.createdAt.$gte = new Date(startTime);
    if (endTime) where.createdAt.$lte = new Date(endTime);
  }

  // 关键词对 rewardName 模糊匹配（如需对 openid/用户加匹配可再扩展）
  if (keyword) {
    const reg = db.RegExp({ regexp: keyword, options: 'i' });
    where.rewardName = reg;
  }

  const collection = db.collection('redeem_records');
  const totalRes = await collection.where(where).count();
  const total = totalRes.total || 0;

  const res = await collection
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const listRaw = res.data || [];

  // 取 openid 列表，补充用户信息（姓名/学号）
  const openids = Array.from(new Set(listRaw.map(i => i.openid).filter(Boolean)));
  let userMap = {};
  if (openids.length) {
    const userRes = await db.collection('users')
      .where({ _openid: _.in(openids) })
      .field({ name: true, studentId: true, sno: true })
      .get();
    userMap = (userRes.data || []).reduce((acc, cur) => {
      acc[cur._openid] = {
        name: cur.name || '',
        studentId: cur.studentId || cur.sno || ''
      };
      return acc;
    }, {});
  }

  const list = listRaw.map(item => {
    const userInfo = userMap[item.openid || ''] || {};
    const userName = userInfo.name || item.userName || '';
    const studentId = userInfo.studentId || item.studentId || '';
    return {
      _id: item._id,
      rewardId: item.rewardId || '',
      rewardName: item.rewardName || '',
      needPoints: item.needPoints ?? item.userConsumedPoints ?? null,
      openid: item.openid || '',
      userName,
      studentId,
      status: item.status || '',
      createdAt: item.createdAt || null,
      cover: item.cover || '',
      userConsumedPoints: item.userConsumedPoints ?? null,
      userTotalPoints: item.userTotalPoints ?? null
    };
  });

  return { page, pageSize, total, list };
}

async function getRedeemSummary() {
  const collection = db.collection('redeem_records');
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [totalRes, todayRes] = await Promise.all([
    collection.count(),
    collection.where({
      createdAt: _.gte(startOfDay),
      status: 'success'
    }).count()
  ]);

  return {
    total: totalRes.total || 0,
    today: todayRes.total || 0
  };
}

async function updateRedeemStatus({ recordId, status }) {
  if (!recordId) throw new Error('缺少记录ID');
  const allow = ['unissued', 'issued', 'failed', 'success'];
  if (!allow.includes(status)) throw new Error('状态不合法');

  await db.collection('redeem_records').doc(recordId).update({
    data: {
      status,
      updatedAt: new Date()
    }
  });
  return { recordId, status };
}

// 可选：补写姓名、学号到 redeem_records（按 openid 查 users）
async function backfillUserInfo({ recordId }) {
  if (!recordId) throw new Error('缺少记录ID');
  const recordRes = await db.collection('redeem_records').doc(recordId).get();
  const rec = recordRes?.data;
  if (!rec || !rec.openid) throw new Error('记录不存在或缺少openid');

  const userRes = await db.collection('users')
    .where({ _openid: rec.openid })
    .field({ name: true, studentId: true, sno: true })
    .limit(1)
    .get();
  const user = userRes.data?.[0] || {};
  const userName = user.name || '';
  const studentId = user.studentId || user.sno || '';

  await db.collection('redeem_records').doc(recordId).update({
    data: {
      userName,
      studentId,
      updatedAt: new Date()
    }
  });
  return { recordId, userName, studentId };
}

