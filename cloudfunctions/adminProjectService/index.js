// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;
const CATEGORY_COLLECTION = 'projectCategories';
const ANNOUNCEMENT_COLLECTION = 'projectAnnouncements';

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
      case 'getAnnouncement':
        return { success: true, data: await getAnnouncement() };
      case 'saveAnnouncement':
        return { success: true, data: await saveAnnouncement(event.payload || {}) };
      case 'deleteAnnouncement':
        return { success: true, data: await deleteAnnouncement(event.payload || {}) };
      case 'saveCategory':
        return { success: true, data: await saveCategory(event.payload || {}) };
      case 'deleteCategory':
        return { success: true, data: await deleteCategory(event.payload || {}) };
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
  const collection = db.collection(CATEGORY_COLLECTION);
  let categoriesRes;
  try {
    categoriesRes = await collection
      .orderBy('order', 'asc')
      .orderBy('createdAt', 'asc')
      .get();
  } catch (err) {
    if (isCollectionNotExist(err)) {
      await ensureCategoryCollection();
      categoriesRes = await collection
        .orderBy('order', 'asc')
        .orderBy('createdAt', 'asc')
        .get();
    } else {
      throw err;
    }
  }
  let categories = categoriesRes.data || [];

  if (!categories.length) {
    await seedCategories();
    categoriesRes = await collection
      .orderBy('order', 'asc')
      .orderBy('createdAt', 'asc')
      .get();
    categories = categoriesRes.data || [];
  } else {
    const existingNames = new Set(categories.map(item => item.name));
    const additional = await fetchDistinctActivityCategories();
    const missing = additional.filter(name => !existingNames.has(name));
    if (missing.length) {
      const now = new Date();
      for (let i = 0; i < missing.length; i++) {
        await collection.add({
          data: {
            name: missing[i],
            order: categories.length + i,
            description: '',
            createdAt: now,
            updatedAt: now
          }
        });
      }
      categoriesRes = await collection
        .orderBy('order', 'asc')
        .orderBy('createdAt', 'asc')
        .get();
      categories = categoriesRes.data || [];
    }
  }

  const names = categories.map(item => item.name);
  const counts = await fetchCategoryCounts(names);

  return categories.map(item => ({
    _id: item._id,
    name: item.name,
    order: item.order ?? 0,
    description: item.description || '',
    projectCount: counts[item.name] || 0,
    createdAt: item.createdAt || null
  }));
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

async function deleteCategory({ categoryId }) {
  if (!categoryId) {
    throw new Error('缺少 categoryId');
  }
  await ensureCategoryCollection();
  const categories = db.collection(CATEGORY_COLLECTION);
  const categoryRes = await categories.doc(categoryId).get();
  const category = categoryRes.data;
  if (!category) {
    throw new Error('类别不存在或已被删除');
  }

  const { total } = await db.collection('activities').where({ category: category.name }).count();
  if (total > 0) {
    throw new Error('该类别仍有关联项目，无法删除');
  }

  await categories.doc(categoryId).remove();
  await normalizeCategoryOrders();
  return { categoryId };
}

async function saveCategory(payload = {}) {
  await ensureCategoryCollection();
  const categories = db.collection(CATEGORY_COLLECTION);
  const categoryId = payload.categoryId || payload._id || '';
  const name = (payload.name || '').trim();
  const description = (payload.description || '').trim();
  const orderValue = Number(payload.order);
  const order = Number.isFinite(orderValue) ? orderValue : 0;
  const now = new Date();

  if (!name) {
    throw new Error('类别名称不能为空');
  }

  if (categoryId) {
    const existingRes = await categories.doc(categoryId).get();
    const existing = existingRes.data;
    if (!existing) {
      throw new Error('类别不存在或已被删除');
    }

    if (existing.name !== name) {
      const dup = await categories
        .where({
          name,
          _id: _.neq(categoryId)
        })
        .limit(1)
        .get();
      if (dup.data && dup.data.length) {
        throw new Error('已存在同名类别');
      }
    }

    let targetOrder = order;
    if (existing.order !== targetOrder) {
      await shiftCategoryOrders(targetOrder, categoryId);
    }

    await categories.doc(categoryId).update({
      data: {
        name,
        description,
        order: targetOrder,
        updatedAt: now
      }
    });

    if (existing.name !== name) {
      await renameActivitiesCategory(existing.name, name);
    }

    await normalizeCategoryOrders();
    return { categoryId };
  }

  const dup = await categories.where({ name }).limit(1).get();
  if (dup.data && dup.data.length) {
    throw new Error('已存在同名类别');
  }

  await shiftCategoryOrders(order);

  const res = await categories.add({
    data: {
      name,
      description,
      order,
      createdAt: now,
      updatedAt: now
    }
  });
  await normalizeCategoryOrders();
  return { categoryId: res._id };
}

async function seedCategories() {
  const activities = await fetchDistinctActivityCategories();
  const list = activities.length ? activities : ['其他'];
  const now = new Date();
  const collection = db.collection(CATEGORY_COLLECTION);
  for (let i = 0; i < list.length; i++) {
    await collection.add({
      data: {
        name: list[i],
        order: i,
        description: '',
        createdAt: now,
        updatedAt: now
      }
    });
  }
}

async function fetchDistinctActivityCategories() {
  const res = await db.collection('activities').field({ category: true }).get();
  const set = new Set();
  (res.data || []).forEach(item => {
    const raw = item?.category;
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach(value => {
      const text = (value ?? '').toString().trim();
      if (text) set.add(text);
    });
  });
  return Array.from(set);
}

async function fetchCategoryCounts(names = []) {
  const counts = {};
  if (!Array.isArray(names) || !names.length) {
    return counts;
  }
  try {
    const res = await db.collection('activities')
      .aggregate()
      .match({
        category: _.in(names)
      })
      .group({
        _id: '$category',
        count: $.sum(1)
      })
      .end();
    (res.list || []).forEach(item => {
      if (item?._id) {
        counts[item._id] = item.count || 0;
      }
    });
  } catch (err) {
    console.warn('fetchCategoryCounts aggregate error', err);
  }
  return counts;
}

async function renameActivitiesCategory(oldName, newName) {
  if (!oldName || oldName === newName) return;
  const collection = db.collection('activities');
  const { total } = await collection.where({ category: oldName }).count();
  if (!total) return;
  const BATCH_SIZE = 100;
  const rounds = Math.ceil(total / BATCH_SIZE);
  for (let i = 0; i < rounds; i++) {
    const { data } = await collection
      .where({ category: oldName })
      .field({ _id: true })
      .limit(BATCH_SIZE)
      .get();
    if (!data || !data.length) break;
    const ids = data.map(item => item._id);
    await collection
      .where({ _id: _.in(ids) })
      .update({
        data: { category: newName }
      });
  }
}

async function ensureCategoryCollection() {
  try {
    await db.createCollection(CATEGORY_COLLECTION);
  } catch (err) {
    if (!isCollectionAlreadyExists(err)) {
      console.warn('ensureCategoryCollection error', err);
    }
  }
}

function isCollectionNotExist(err = {}) {
  return err?.errCode === -502005 || err?.code === 'DATABASE_COLLECTION_NOT_EXIST';
}

function isCollectionAlreadyExists(err = {}) {
  // errCode -502006 indicates already exists
  return err?.errCode === -502006 || err?.code === 'DATABASE_COLLECTION_ALREADY_EXISTS';
}

async function shiftCategoryOrders(order, excludeId = '') {
  const categories = db.collection(CATEGORY_COLLECTION);
  const where = excludeId
    ? { order: _.gte(order), _id: _.neq(excludeId) }
    : { order: _.gte(order) };
  let res;
  try {
    res = await categories.where(where).field({ _id: true }).get();
  } catch (err) {
    if (isCollectionNotExist(err)) {
      await ensureCategoryCollection();
      return;
    }
    throw err;
  }

  const ids = (res.data || []).map(item => item._id).filter(Boolean);
  if (!ids.length) return;
  const BATCH_SIZE = 100;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);
    await categories
      .where({ _id: _.in(batchIds) })
      .update({
        data: { order: _.inc(1) }
      });
  }
}

async function normalizeCategoryOrders() {
  const categories = db.collection(CATEGORY_COLLECTION);
  let res;
  try {
    res = await categories
      .orderBy('order', 'asc')
      .orderBy('createdAt', 'asc')
      .get();
  } catch (err) {
    if (isCollectionNotExist(err)) {
      return;
    }
    throw err;
  }

  const list = res.data || [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    const currentOrder = typeof item.order === 'number' ? item.order : i;
    if (currentOrder !== i) {
      await categories.doc(item._id).update({
        data: { order: i }
      });
    }
  }
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

async function getAnnouncement() {
  try {
    const res = await db.collection(ANNOUNCEMENT_COLLECTION)
      .orderBy('publishTime', 'desc')
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get();
    return res.data?.[0] || null;
  } catch (err) {
    if (isCollectionNotExist(err)) {
      return null;
    }
    throw err;
  }
}

async function saveAnnouncement(payload = {}) {
  await ensureAnnouncementCollection();
  const collection = db.collection(ANNOUNCEMENT_COLLECTION);
  const announcementId = payload.announcementId || payload._id || '';
  const title = (payload.title || '活动资讯').trim() || '活动资讯';
  const content = (payload.content || '').trim();
  if (!content) {
    throw new Error('公告内容不能为空');
  }
  const now = new Date();
  const expireTime = buildExpireTime(payload.expireTime);
  const publishTime = payload.publishTime ? new Date(payload.publishTime) : now;

  if (announcementId) {
    await collection.doc(announcementId).update({
      data: {
        title,
        content,
        expireTime,
        publishTime,
        updatedAt: now
      }
    });
    return { announcementId };
  }

  const existing = await collection.limit(1).get();
  if (existing.data && existing.data.length) {
    const docId = existing.data[0]._id;
    await collection.doc(docId).update({
      data: {
        title,
        content,
        expireTime,
        publishTime,
        updatedAt: now
      }
    });
    return { announcementId: docId };
  }

  const res = await collection.add({
    data: {
      title,
      content,
      expireTime,
      publishTime,
      createdAt: now,
      updatedAt: now
    }
  });
  return { announcementId: res._id };
}

async function ensureAnnouncementCollection() {
  try {
    await db.createCollection(ANNOUNCEMENT_COLLECTION);
  } catch (err) {
    if (!isCollectionAlreadyExists(err)) {
      console.warn('ensureAnnouncementCollection error', err);
    }
  }
}

async function deleteAnnouncement(payload = {}) {
  await ensureAnnouncementCollection();
  const collection = db.collection(ANNOUNCEMENT_COLLECTION);
  let targetId = payload.announcementId || payload._id || '';
  if (!targetId) {
    const existing = await collection.limit(1).get();
    targetId = existing.data?.[0]?._id || '';
  }
  if (!targetId) {
    throw new Error('暂无公告可删除');
  }
  await collection.doc(targetId).remove();
  return { announcementId: targetId };
}

function buildExpireTime(expireDateText) {
  if (!expireDateText || typeof expireDateText !== 'string') {
    return null;
  }
  const parts = expireDateText.split('-');
  if (parts.length !== 3) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = parts.map(p => p.trim());
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (![year, month, day].every(n => Number.isInteger(n) && n > 0)) {
    return null;
  }
  const yyyy = `${year}`.padStart(4, '0');
  const mm = `${month}`.padStart(2, '0');
  const dd = `${day}`.padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}T23:59:59.999+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}