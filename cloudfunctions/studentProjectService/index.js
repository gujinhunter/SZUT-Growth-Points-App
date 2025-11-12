// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  try {
    const action = event?.action || 'listProjects';
    switch (action) {
      case 'listProjects':
        return { success: true, data: await listProjects(event.payload || {}) };
      case 'getProjectDetail':
        return { success: true, data: await getProjectDetail(event.payload || {}) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('studentProjectService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function listProjects({ page = 1, pageSize = 100, keyword = '', category = '' }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const baseCondition = { status: _.neq('disabled') };
  const conditions = [baseCondition];
  if (category) {
    conditions.push({ category });
  }
  if (keyword) {
    const reg = db.RegExp({ regexp: keyword, options: 'i' });
    conditions.push(_.or([{ name: reg }, { remark: reg }, { category: reg }]));
  }

  let query = db.collection('activities');
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else {
    query = query.where(_.and(conditions));
  }

  const totalRes = await query.count();
  const total = totalRes.total || 0;

  const res = await query
    .orderBy('category', 'asc')
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .field({
      name: true,
      category: true,
      score: true,
      remark: true,
      createTime: true,
      isOpen: true
    })
    .get();

  const formatScore = score => {
    if (Array.isArray(score)) return score.join('/');
    if (typeof score === 'string') return score.replace(/,/g, '/');
    if (typeof score === 'number') return score.toString();
    return '';
  };

  const grouped = {};
  (res.data || []).forEach(item => {
    const cat = item.category || '未分类';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      _id: item._id,
      name: item.name || '',
      category: item.category || '未分类',
      score: item.score || 0,
      displayScore: formatScore(item.score),
      remark: item.remark || '',
      isOpen: item.isOpen !== false,
      createTime: item.createTime || null
    });
  });

  const categories = Object.keys(grouped).sort().map(categoryName => ({
    category: categoryName,
    items: grouped[categoryName]
  }));

  return {
    page,
    pageSize,
    total,
    list: categories,
    flat: (res.data || []).map(item => ({
      _id: item._id,
      name: item.name || '',
      category: item.category || '未分类',
      score: item.score || 0,
      displayScore: formatScore(item.score),
      remark: item.remark || '',
      isOpen: item.isOpen !== false,
      createTime: item.createTime || null
    }))
  };
}

async function getProjectDetail({ projectId }) {
  if (!projectId) {
    throw new Error('缺少 projectId');
  }
  const res = await db.collection('activities')
    .doc(projectId)
    .field({ name: true, category: true, score: true, isOpen: true })
    .get();
  const data = res.data;
  if (!data) {
    throw new Error('项目不存在');
  }
  const scoreOptions = normalizeScore(data.score);
  return {
    projectId,
    name: data.name || '',
    category: data.category || '',
    scoreOptions,
    isOpen: data.isOpen !== false
  };
}

function normalizeScore(score) {
  if (Array.isArray(score)) {
    return score.map(s => Number(s)).filter(num => Number.isFinite(num));
  }
  const single = Number(score);
  return Number.isFinite(single) ? [single] : [];
}

function sanitizeExt(ext) {
  if (!ext) return '.jpg';
  const lower = ext.toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf', '.doc', '.docx'];
  return allowed.includes(lower) ? lower : '.jpg';
}