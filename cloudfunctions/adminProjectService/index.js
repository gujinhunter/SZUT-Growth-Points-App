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

    const action = event?.action || 'listProjects';
    switch (action) {
      case 'listProjects':
        return { success: true, data: await listProjects(event.payload || {}) };
      case 'listCategories':
        return { success: true, data: await listCategories() };
      case 'saveProject':
        return { success: true, data: await saveProject(event.payload || {}) };
      case 'deleteProject':
        return { success: true, data: await deleteProject(event.payload || {}) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('adminProjectService error', err);
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

async function listProjects({ page = 1, pageSize = 50, category = '', keyword = '' }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const conditions = [];
  if (category) {
    conditions.push({ category });
  }
  if (keyword) {
    const reg = db.RegExp({ regexp: keyword, options: 'i' });
    conditions.push(_.or([{ name: reg }, { remark: reg }]));
  }

  let query = db.collection('activities');
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(_.and(conditions));
  }

  const totalRes = await query.count();
  const total = totalRes.total || 0;

  const res = await query
    .orderBy('category', 'asc')
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const list = (res.data || []).map(item => ({
    _id: item._id,
    name: item.name || '',
    category: item.category || '',
    score: item.score || 0,
    scoreText: formatScore(item.score),
    remark: item.remark || '',
    status: item.status || 'enabled',
    createTime: item.createTime || null
  }));

  return { list, page, pageSize, total };
}

async function listCategories() {
  const res = await db.collection('activities')
    .field({ category: true })
    .get();
  const set = new Set();
  (res.data || []).forEach(item => {
    const raw = item?.category;
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach(value => {
      const text = (value ?? '').toString().trim();
      if (text) set.add(text);
    });
  });
  const categories = Array.from(set).sort();
  if (!categories.length) categories.push('其他');
  return categories;
}

async function saveProject(payload) {
  const projectId = payload.projectId || payload._id || '';
  const name = (payload.name || '').trim();
  const category = (payload.category || '').trim() || '其他';
  const remark = (payload.remark || '').trim();
  const score = parseScore(payload.score ?? payload.scoreText ?? '0');

  if (!name) {
    throw new Error('项目名称不能为空');
  }
  if (score === null) {
    throw new Error('积分格式不正确');
  }

  const data = {
    name,
    category,
    score,
    remark
  };

  if (projectId) {
    await db.collection('activities').doc(projectId).update({ data });
    return { projectId };
  }

  data.createTime = new Date();
  const res = await db.collection('activities').add({ data });
  return { projectId: res._id };
}

async function deleteProject({ projectId }) {
  if (!projectId) {
    throw new Error('缺少 projectId');
  }
  await db.collection('activities').doc(projectId).remove();
  return { projectId };
}

function parseScore(input) {
  if (Array.isArray(input)) {
    const nums = input.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0);
    return nums.length ? nums : null;
  }
  const text = (input ?? '').toString().trim();
  if (!text) return null;
  const parts = text.split(/[,/]/).map(p => p.trim()).filter(Boolean);
  const nums = parts.map(n => Number(n)).filter(n => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return nums.length === 1 ? nums[0] : nums;
}

function formatScore(score) {
  if (Array.isArray(score)) return score.join('/');
  if (typeof score === 'number') return score.toString();
  if (typeof score === 'string') return score;
  return '';
}