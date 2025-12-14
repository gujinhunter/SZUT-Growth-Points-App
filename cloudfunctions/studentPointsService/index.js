// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) {
      throw new Error('缺少OPENID');
    }

    const action = event?.action || 'getSummary';
    const payload = event?.payload || {};

    switch (action) {
      case 'getSummary':
        return { success: true, data: await getSummary(OPENID) };
      case 'listDetails':
        return { success: true, data: await listDetails(OPENID, payload) };
      case 'listRewards':
        return { success: true, data: await listRewards(payload) };
      case 'redeemReward':
        return { success: true, data: await redeemReward(OPENID, payload) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('studentPointsService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function getSummary(openid) {
  const usersCollection = db.collection('users');

  const userRes = await usersCollection
    .where({ _openid: openid })
    .field({ totalPoints: true, role: true, consumedPoints: true })
    .limit(1)
    .get();
  const user = userRes.data?.[0] || null;
  const totalPoints = user?.totalPoints || 0;
  const consumedPoints = user?.consumedPoints || 0;
  const role = user?.role || 'student';
  const redeemablePoints = Math.max(totalPoints - consumedPoints, 0);

  const baseCondition = { role: _.neq('admin') };

  // 使用 aggregate 计算总积分和平均积分，避免加载所有学生数据
  const [totalRes, aggRes] = await Promise.all([
    usersCollection.where(baseCondition).count(),
    usersCollection.aggregate()
      .match({ role: _.neq('admin') })
      .group({
        _id: null,
        totalPointsSum: $.sum('$totalPoints')
      })
      .end()
  ]);

  const totalStudents = totalRes.total || 0;
  const totalPointsSum = aggRes.list?.[0]?.totalPointsSum || 0;
  const averagePoints = totalStudents ? Math.round(totalPointsSum / totalStudents) : 0;

  // 使用 count 查询计算排名，避免加载所有学生数据
  let rank = '-';
  if (role !== 'admin' && totalStudents) {
    const higherCountRes = await usersCollection
      .where({
        role: _.neq('admin'),
        totalPoints: _.gt(totalPoints)
      })
      .count();
    rank = (higherCountRes.total || 0) + 1;
  }

  return {
    totalPoints,
    redeemablePoints,
    averagePoints,
    rank,
    role
  };
}

async function listDetails(openid, { page = 1, pageSize = 100 }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 200);

  const where = { studentOpenId: openid, status: '已通过' };
  const applicationsCollection = db.collection('applications');

  const countRes = await applicationsCollection.where(where).count();
  const total = countRes.total || 0;
  if (!total) {
    return { page, pageSize, total: 0, list: [] };
  }

  const MAX_LIMIT = 100;
  const batches = Math.ceil(total / MAX_LIMIT);
  const tasks = [];
  for (let i = 0; i < batches; i++) {
    tasks.push(
      applicationsCollection
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .field({
          projectName: true,
          points: true,
          createTime: true,
          reviewTime: true,
          status: true
        })
        .get()
    );
  }

  const results = await Promise.all(tasks);
  const all = results.flatMap(res => res.data || []);
  all.sort((a, b) => {
    const timeA = normalizeDate(a.reviewTime || a.createTime)?.getTime() || 0;
    const timeB = normalizeDate(b.reviewTime || b.createTime)?.getTime() || 0;
    return timeB - timeA;
  });

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageList = all.slice(start, end).map(item => ({
    projectName: item.projectName || '—',
    points: item.points || 0,
    createTime: normalizeDate(item.reviewTime || item.createTime)?.getTime() || null
  }));

  return {
    page,
    pageSize,
    total,
    list: pageList
  };
}

async function listRewards({ page = 1, pageSize = 50, enabledOnly = true }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const where = {};
  if (enabledOnly !== false) {
    where.status = 'enabled'; // 建议 rewards 表使用 status: 'enabled'|'disabled'
  }

  const rewardsCollection = db.collection('rewards');
  const countRes = await rewardsCollection.where(where).count();
  const total = countRes.total || 0;
  if (!total) {
    return { page, pageSize, total: 0, list: [] };
  }

  const start = (page - 1) * pageSize;
  const res = await rewardsCollection
    .where(where)
    .orderBy('sort', 'asc')
    .skip(start)
    .limit(pageSize)
    .field({
      name: true,
      cover: true,
      needPoints: true,
      requiredPoints: true,
      points: true,
      stock: true,
      status: true,
      description: true
    })
    .get();

  // 先批量把 cloud:// fileID 转换为临时访问 URL，避免前端拿到 fileID 无法直接展示
  const coverTempMap = await buildCoverTempMap(res.data || []);

  const list = (res.data || []).map(item => ({
    id: item._id,
    name: item.name || '未命名奖品',
    cover: normalizeCover(item.cover, coverTempMap),
    needPoints: normalizePoints(item),
    stock: item.stock ?? null,
    description: item.description || '',
    status: item.status || 'enabled'
  }));

  return { page, pageSize, total, list };
}

// 将 rewards 里的 cloud:// 封面批量换成临时 URL
async function buildCoverTempMap(list) {
  const fileIds = (list || [])
    .map(i => i.cover)
    .filter(v => typeof v === 'string' && v.startsWith('cloud://'));
  if (!fileIds.length) return {};
  try {
    const res = await cloud.getTempFileURL({ fileList: fileIds });
    return (res?.fileList || []).reduce((acc, cur) => {
      if (cur.fileID && cur.tempFileURL) acc[cur.fileID] = cur.tempFileURL;
      return acc;
    }, {});
  } catch (e) {
    console.warn('获取封面临时链接失败', e);
    return {};
  }
}

function normalizeCover(cover, tempMap = {}) {
  if (!cover) return '';
  // 支持直接填写 https 链接或 fileID，也容忍 cover 是数组时取第一个
  const value = Array.isArray(cover) ? cover[0] : cover;
  if (typeof value !== 'string') return '';
  if (value.startsWith('cloud://')) {
    return tempMap[value] || value; // 有临时链接就用，没有就保持原值
  }
  return value;
}

function normalizePoints(item) {
  const v = item?.needPoints ?? item?.requiredPoints ?? item?.points;
  if (v === 0) return 0;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

async function redeemReward(openid, { rewardId }) {
  if (!rewardId) {
    throw new Error('缺少奖品ID');
  }

  return db.runTransaction(async (transaction) => {
    const rewardsCollection = transaction.collection('rewards');
    const usersCollection = transaction.collection('users');
    const recordsCollection = transaction.collection('redeem_records');

    const rewardDoc = await rewardsCollection.doc(rewardId).get();
    const reward = rewardDoc?.data;
    if (!reward) {
      throw new Error('奖品不存在');
    }
    if (reward.status && reward.status !== 'enabled') {
      throw new Error('奖品已下架');
    }

    const needPoints = normalizePoints(reward);
    if (!Number.isFinite(needPoints) || needPoints <= 0) {
      throw new Error('奖品积分配置有误');
    }

    if (reward.stock !== undefined && reward.stock !== null && reward.stock <= 0) {
      throw new Error('库存不足');
    }

    const userRes = await usersCollection
      .where({ _openid: openid })
      .field({ totalPoints: true, consumedPoints: true, name: true, studentId: true, sno: true })
      .limit(1)
      .get();
    const user = userRes.data?.[0];
    if (!user) {
      throw new Error('用户不存在');
    }
    const totalPoints = Number(user.totalPoints || 0);
    const consumedPoints = Number(user.consumedPoints || 0);
    const redeemablePoints = Math.max(totalPoints - consumedPoints, 0);
    if (redeemablePoints < needPoints) {
      throw new Error('可用积分不足');
    }

    if (reward.stock !== undefined && reward.stock !== null) {
      await rewardsCollection.doc(rewardId).update({
        data: { stock: _.inc(-1) }
      });
    }

    await usersCollection.doc(user._id).update({
      data: { consumedPoints: _.inc(needPoints) }
    });

    const record = {
      rewardId,
      rewardName: reward.name || '',
      needPoints,
      openid,
      cover: reward.cover || '',
      status: 'unissued', // 默认未发放，便于管理员处理
      createdAt: new Date(),
      userTotalPoints: totalPoints,
      userConsumedPoints: consumedPoints + needPoints,
      userName: user?.name || '',
      studentId: user?.studentId || user?.sno || ''
    };
    const addRes = await recordsCollection.add({ data: record });

    return {
      recordId: addRes._id,
      remainingPoints: redeemablePoints - needPoints
    };
  });
}

function normalizeDate(input) {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'string') {
    const normalized = input.replace(/T/, ' ').replace(/\./g, '-').replace(/\//g, '-');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof input === 'number') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}