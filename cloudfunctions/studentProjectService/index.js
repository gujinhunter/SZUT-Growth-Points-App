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

  const categoriesMetaList = await fetchAllCategoryMeta();
  const categoryMap = {};
  const categories = [];

  categoriesMetaList.forEach((meta, index) => {
    const name = meta.name || `分类${index + 1}`;
    const items = grouped[name] || [];
    categories.push({
      category: name,
      description: meta.description || '',
      order: typeof meta.order === 'number' ? meta.order : index,
      items
    });
    categoryMap[name] = true;
  });

  Object.keys(grouped).forEach(categoryName => {
    if (categoryMap[categoryName]) return;
    categories.push({
      category: categoryName,
      description: '',
      order: Number.MAX_SAFE_INTEGER,
      items: grouped[categoryName]
    });
  });

  categories.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.category.localeCompare(b.category);
  });

  const announcement = await fetchLatestAnnouncement();

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
    })),
    announcement
  };
}

async function fetchAllCategoryMeta() {
  try {
    const res = await db.collection('projectCategories')
      .orderBy('order', 'asc')
      .orderBy('createdAt', 'asc')
      .field({
        name: true,
        description: true,
        order: true
      })
      .get();
    if (res.data && res.data.length) {
      return res.data;
    }
  } catch (err) {
    console.warn('fetchAllCategoryMeta error', err);
  }
  return [];
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

async function fetchLatestAnnouncement() {
  try {
    const now = new Date();
    const res = await db.collection('projectAnnouncements')
      .where(_.or([
        { expireTime: _.exists(false) },
        { expireTime: _.eq(null) },
        { expireTime: _.gte(now) }
      ]))
      .orderBy('publishTime', 'desc')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    return res.data?.[0] || null;
  } catch (err) {
    if (err?.errCode === -502005 || err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
      return null;
    }
    console.warn('fetchLatestAnnouncement error', err);
    return null;
  }
}