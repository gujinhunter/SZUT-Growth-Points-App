// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const BATCH_SIZE = 20;

class AuthError extends Error {
  constructor(message, code = 'AUTH_DENIED') {
    super(message);
    this.code = code;
  }
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const adminProfile = await ensureAdmin(OPENID);

    const action = event?.action || 'listPending';
    switch (action) {
      case 'listPending':
        return { success: true, data: await listPending(event.payload || {}) };
      case 'listHistory':
        return { success: true, data: await listHistory(event.payload || {}) };
      case 'approveApplication':
        return { success: true, data: await approveApplication(event.payload || {}, adminProfile, OPENID) };
      case 'rejectApplication':
        return { success: true, data: await rejectApplication(event.payload || {}, adminProfile, OPENID) };
      case 'listFilters':
        return { success: true, data: await listFilters() };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('adminReviewService error', err);
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
    .field({ name: true, role: true })
    .limit(1)
    .get();
  const user = res.data?.[0];
  if (!user || user.role !== 'admin') {
    throw new AuthError('无管理员权限');
  }
  return { openid, name: user.name || '管理员' };
}

async function listPending({ page = 1, pageSize = 20, keyword = '', category = '' }) {
  return listApplications({ status: '待审核', page, pageSize, keyword, category });
}

async function listHistory({ page = 1, pageSize = 20, keyword = '', category = '', status = '' }) {
  const match = {};
  if (status) match.afterStatus = status;

  const query = db.collection('reviewLogs').where(match).orderBy('createTime', 'desc');
  const logs = await fetchLogsWithApplications(query, page, pageSize);

  let filtered = logs;
  if (category) {
    filtered = filtered.filter(item => (item.projectCategory || '') === category);
  }

  const keywordValue = (keyword || '').trim().toLowerCase();
  if (keywordValue) {
    filtered = filtered.filter(item => item._searchText.includes(keywordValue));
  }

  return {
    page,
    pageSize,
    total: filtered.length,
    list: filtered
  };
}

async function approveApplication({ applicationId, remark = '' }, adminProfile, adminOpenId) {
  if (!applicationId) throw new Error('缺少 applicationId');

  const appRef = db.collection('applications').doc(applicationId);
  const appSnap = await appRef.get();
  const app = appSnap.data;
  if (!app) throw new Error('申请不存在');
  if (app.status === '已通过') {
    return { applicationId, message: '该申请已通过' };
  }

  const points = Number(app.points || 0) || 0;
  await appRef.update({
    data: {
      status: '已通过',
      reviewTime: new Date(),
      rejectRemark: '',
      reviewRemark: remark
    }
  });

  if (app.studentOpenId && points > 0) {
    await db.collection('users')
      .where({ _openid: app.studentOpenId })
      .update({ data: { totalPoints: _.inc(points) } });
  }

  await db.collection('reviewLogs').add({
    data: {
      applicationId,
      projectId: app.projectId || null,
      studentName: app.name || '',
      studentId: app.studentId || '',
      projectName: app.projectName || '',
      projectCategory: app.projectCategory || '',
      beforeStatus: app.status,
      afterStatus: '已通过',
      remark: remark || '',
      adminOpenId,
      adminName: adminProfile.name,
      createTime: new Date()
    }
  });

  return { applicationId, status: '已通过' };
}

async function rejectApplication({ applicationId, remark = '' }, adminProfile, adminOpenId) {
  if (!applicationId) throw new Error('缺少 applicationId');
  const trimmedRemark = remark.trim();
  if (!trimmedRemark) throw new Error('驳回原因不能为空');

  const appRef = db.collection('applications').doc(applicationId);
  const appSnap = await appRef.get();
  const app = appSnap.data;
  if (!app) throw new Error('申请不存在');
  if (app.status === '已驳回') {
    return { applicationId, message: '该申请已驳回' };
  }

  await appRef.update({
    data: {
      status: '已驳回',
      reviewTime: new Date(),
      rejectRemark: trimmedRemark
    }
  });

  await db.collection('reviewLogs').add({
    data: {
      applicationId,
      projectId: app.projectId || null,
      studentName: app.name || '',
      studentId: app.studentId || '',
      projectName: app.projectName || '',
      projectCategory: app.projectCategory || '',
      beforeStatus: app.status,
      afterStatus: '已驳回',
      remark: trimmedRemark,
      adminOpenId,
      adminName: adminProfile.name,
      createTime: new Date()
    }
  });

  return { applicationId, status: '已驳回' };
}

async function listFilters() {
  const categoriesRes = await db.collection('activities').field({ category: true }).get();
  const categoriesSet = new Set();
  (categoriesRes.data || []).forEach(item => {
    const raw = item?.category;
    const list = Array.isArray(raw) ? raw : [raw];
    list.forEach(value => {
      const text = (value ?? '').toString().trim();
      if (text) categoriesSet.add(text);
    });
  });
  const categories = Array.from(categoriesSet).sort();

  return {
    categories,
    statuses: ['已通过', '已驳回']
  };
}

async function listApplications({ status = '待审核', page = 1, pageSize = 20, keyword = '', category = '' }) {
  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const conditions = [{ status }];
  if (category) conditions.push({ projectCategory: category });

  let query = db.collection('applications');
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else {
    query = query.where(_.and(conditions));
  }

  const totalRes = await query.count();
  const total = totalRes.total || 0;

  const res = await query
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .field({
      name: true,
      studentId: true,
      studentOpenId: true,
      projectName: true,
      projectCategory: true,
      reason: true,
      points: true,
      createTime: true,
      fileIDs: true
    })
    .get();

  const students = await fetchStudents(
    [...new Set((res.data || []).map(item => item.studentOpenId || item._openid).filter(Boolean))]
  );

  const keywordValue = (keyword || '').trim().toLowerCase();
  const list = (res.data || []).map(item => {
    const studentKey = item.studentOpenId || item._openid;
    const studentInfo = studentKey ? students.get(studentKey) : null;
    const studentName = studentInfo?.name || item.name || '未知申请人';
    const studentId = studentInfo?.studentId || item.studentId || '—';
    const projectCategory = item.projectCategory || '—';

    const searchText = [
      studentName,
      studentId,
      item.projectName || '',
      projectCategory,
      item.reason || ''
    ].map(val => (val || '').toString().toLowerCase()).join(' ');

    return {
      _id: item._id,
      name: studentName,  // 添加 name 字段，兼容前端使用
      studentName,
      studentId,
      projectName: item.projectName || '—',
      projectCategory,
      points: item.points || 0,
      reason: item.reason || '',
      createTime: item.createTime || null,
      fileIDs: item.fileIDs || [],
      status,
      searchable: searchText
    };
  }).filter(item => keywordValue ? item.searchable.includes(keywordValue) : true);

  return { page, pageSize, total, list };
}

async function fetchLogsWithApplications(query, page, pageSize) {
  const res = await query
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  const logs = res.data || [];

  const applicationIds = [...new Set(logs.map(item => item.applicationId).filter(Boolean))];
  const applications = await fetchApplicationsByIds(applicationIds);
  const projectIds = [...new Set([
    ...logs.map(item => item.projectId).filter(Boolean),
    ...Array.from(applications.values()).map(app => app?.projectId).filter(Boolean)
  ])];
  const projects = await fetchProjectsByIds(projectIds);
  const adminIds = [...new Set(logs.map(item => item.adminOpenId).filter(Boolean))];
  const admins = await fetchAdminsByIds(adminIds);
  const students = await fetchStudents(
    [...new Set(Array.from(applications.values()).map(app => app.studentOpenId || app._openid).filter(Boolean))]
  );

  const enrichedLogs = logs.map(item => {
    const app = applications.get(item.applicationId);
    const studentKey = app?.studentOpenId || app?._openid;
    const studentInfo = studentKey ? students.get(studentKey) : null;
    const projectInfo = (app?.projectId && projects.get(app.projectId))
      || (item.projectId && projects.get(item.projectId))
      || null;

    const studentName = studentInfo?.name || app?.name || item.studentName || '未知申请人';
    const studentId = studentInfo?.studentId || app?.studentId || item.studentId || '—';
    const projectName = projectInfo?.name || app?.projectName || item.projectName || '—';
    const projectCategory = projectInfo?.category || app?.projectCategory || item.projectCategory || '—';
    const adminInfo = admins.get(item.adminOpenId);
    const adminName = adminInfo?.name || item.adminName || '管理员';

    const searchText = [
      projectName,
      projectCategory,
      studentName,
      studentId,
      adminName,
      item.remark || ''
    ].map(val => (val || '').toString().toLowerCase()).join(' ');

    const applicationTime = normalizeDate(app?.createTime) || normalizeDate(item.applicationTime);
    const reviewTime = normalizeDate(app?.reviewTime) || normalizeDate(item.reviewTime) || normalizeDate(item.createTime);

    return {
      _id: item._id,
      projectName,
      projectCategory,
      studentName,
      studentId,
      adminName,
      remark: item.remark || '',
      afterStatus: item.afterStatus,
      afterStatusText: item.afterStatus || '—',
      createTime: reviewTime ? reviewTime.getTime() : null,
      createTimeFormatted: null,
      applicationTime: applicationTime ? applicationTime.getTime() : null,
      applicationTimeFormatted: null,
      _searchText: searchText
    };
  });

  return enrichedLogs;
}

async function fetchApplicationsByIds(ids) {
  const map = new Map();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const res = await db.collection('applications')
      .where({ _id: _.in(batch) })
      .field({
        name: true,
        studentId: true,
        studentOpenId: true,
        projectName: true,
        projectCategory: true,
        createTime: true,
        reviewTime: true,
        _openid: true,
        projectId: true
      })
      .get();
    (res.data || []).forEach(item => map.set(item._id, item));
  }
  return map;
}

async function fetchApplications(ids) {
  const map = new Map();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const res = await db.collection('applications')
      .where({ _id: _.in(batch) })
      .field({
        name: true,
        studentId: true,
        studentOpenId: true,
        projectName: true,
        projectCategory: true,
        createTime: true,
        reviewTime: true,
        points: true,
        reason: true,
        fileIDs: true,
        _openid: true,
        projectId: true
      })
      .get();
    (res.data || []).forEach(item => map.set(item._id, item));
  }
  return map;
}

async function fetchStudents(openIds) {
  if (!openIds.length) return new Map();
  const map = new Map();
  for (let i = 0; i < openIds.length; i += BATCH_SIZE) {
    const batch = openIds.slice(i, i + BATCH_SIZE);
    const res = await db.collection('users')
      .where({ _openid: _.in(batch) })
      .field({
        _openid: true,
        name: true,
        realName: true,
        nickName: true,
        studentId: true,
        studentID: true,
        studentNo: true
      })
      .get();
    (res.data || []).forEach(item => {
      const key = item._openid;
      if (!key) return;
      map.set(key, {
        name: item.name || item.realName || item.nickName || '',
        studentId: item.studentId || item.studentID || item.studentNo || ''
      });
    });
  }
  return map;
}

async function fetchProjectsByIds(ids) {
  const map = new Map();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const res = await db.collection('activities')
      .where({ _id: _.in(batch) })
      .field({ name: true, category: true })
      .get();
    (res.data || []).forEach(item => map.set(item._id, {
      name: item.name || '',
      category: item.category || ''
    }));
  }
  return map;
}

async function fetchAdminsByIds(openIds) {
  if (!openIds.length) return new Map();
  const map = new Map();
  for (let i = 0; i < openIds.length; i += BATCH_SIZE) {
    const batch = openIds.slice(i, i + BATCH_SIZE);
    const res = await db.collection('users')
      .where({ _openid: _.in(batch) })
      .field({
        _openid: true,
        name: true,
        realName: true,
        nickName: true
      })
      .get();
    (res.data || []).forEach(item => {
      if (!item._openid) return;
      map.set(item._openid, {
        name: item.name || item.realName || item.nickName || '管理员'
      });
    });
  }
  return map;
}

function normalizeDate(input) {
  if (!input) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof input === 'string') {
    const str = input.replace(/\//g, '-').replace(/\./g, '-');
    // 如果字符串没有时区信息，默认按 UTC 解析并手动补 +08:00
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
      const iso = `${str.replace(' ', 'T')}+08:00`;
      const parsed = new Date(iso);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function formatDateTime(date) {
  if (!date) return '';
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  const hh = `${date.getHours()}`.padStart(2, '0');
  const mi = `${date.getMinutes()}`.padStart(2, '0');
  const ss = `${date.getSeconds()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}