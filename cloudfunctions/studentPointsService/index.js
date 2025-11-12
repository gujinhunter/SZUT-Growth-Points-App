// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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
    .field({ totalPoints: true, role: true })
    .limit(1)
    .get();
  const user = userRes.data?.[0] || null;
  const totalPoints = user?.totalPoints || 0;
  const role = user?.role || 'student';

  const baseCondition = { role: _.neq('admin') };

  const MAX_LIMIT = 100;
  const totalRes = await usersCollection.where(baseCondition).count();
  const totalStudents = totalRes.total || 0;

  let allStudents = [];
  if (totalStudents > 0) {
    const batches = Math.ceil(totalStudents / MAX_LIMIT);
    const tasks = [];
    for (let i = 0; i < batches; i++) {
      tasks.push(
        usersCollection
          .where(baseCondition)
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .field({ totalPoints: true, _openid: true })
          .get()
      );
    }
    const results = await Promise.all(tasks);
    allStudents = results.flatMap(res => res.data || []);
  }

  const totalPointsSum = allStudents.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
  const averagePoints = totalStudents ? Math.round(totalPointsSum / totalStudents) : 0;

  let rank = '-';
  if (role !== 'admin' && totalStudents) {
    const higherCount = allStudents.filter(item => (item.totalPoints || 0) > totalPoints).length;
    rank = higherCount + 1;
  }

  return {
    totalPoints,
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