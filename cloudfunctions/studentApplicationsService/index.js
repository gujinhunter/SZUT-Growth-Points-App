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

    const action = event?.action || 'listApplications';
    const payload = event?.payload || {};

    switch (action) {
      case 'listApplications':
        return { success: true, data: await listApplications(OPENID, payload) };
      case 'createApplication':
        return { success: true, data: await createApplication(OPENID, payload) };
      case 'getFileUrl':
        return { success: true, data: await getFileUrl(OPENID, payload) };
      case 'bindStudentProfile':
        return { success: true, data: await bindStudentProfile(OPENID, payload) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('studentApplicationsService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function listApplications(openid, { page = 1, pageSize = 50 }) {
  // 严格验证 openid，确保不为空且是有效字符串
  if (!openid || typeof openid !== 'string' || openid.trim() === '') {
    console.error('listApplications: 无效的 openid', openid);
    throw new Error('用户身份验证失败');
  }

  page = Math.max(Number(page) || 1, 1);
  pageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const applicationsCollection = db.collection('applications');
  // 使用严格匹配，确保 studentOpenId 字段存在且等于当前用户的 openid
  const where = { 
    studentOpenId: openid.trim()
  };

  console.log('listApplications: 查询条件', { openid: openid.trim(), where });

  const countRes = await applicationsCollection.where(where).count();
  const total = countRes.total || 0;
  if (!total) {
    return {
      page,
      pageSize,
      total: 0,
      list: [],
      groups: []
    };
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
          projectCategory: true,
          status: true,
          points: true,
          reason: true,
          fileIDs: true,
          fileNames: true,
          createTime: true,
          reviewTime: true,
          rejectRemark: true,
          studentOpenId: true  // 包含此字段用于二次验证
        })
        .get()
    );
  }

  const results = await Promise.all(tasks);
  const all = results.flatMap(res => res.data || []);
  
  // 二次验证：确保所有记录都属于当前用户（防止数据泄露）
  const validOpenId = openid.trim();
  const filtered = all.filter(item => {
    const itemOpenId = item.studentOpenId || '';
    const isValid = itemOpenId === validOpenId;
    if (!isValid) {
      console.warn('listApplications: 发现不属于当前用户的记录', {
        itemId: item._id,
        itemStudentOpenId: itemOpenId,
        currentOpenId: validOpenId
      });
    }
    return isValid;
  });
  
  console.log(`listApplications: 查询到 ${all.length} 条记录，过滤后 ${filtered.length} 条属于当前用户`);
  
  filtered.sort((a, b) => {
    const timeA = normalizeDate(a.createTime)?.getTime() || 0;
    const timeB = normalizeDate(b.createTime)?.getTime() || 0;
    return timeB - timeA;
  });

  const formatScore = score => {
    if (Array.isArray(score)) return score.join('/');
    if (typeof score === 'string') return score.replace(/,/g, '/');
    return score ?? 0;
  };

  const statusClassMap = {
    '已通过': 'approved',
    '已驳回': 'rejected'
  };

  const formatted = filtered.map(item => {
    const fileIDs = Array.isArray(item.fileIDs)
      ? item.fileIDs
      : item.fileID
        ? [item.fileID]
        : [];
    const fileNames = Array.isArray(item.fileNames) && item.fileNames.length
      ? item.fileNames
      : fileIDs.map((_, idx) => `附件${idx + 1}`);

    const latestTime = normalizeDate(item.reviewTime) || normalizeDate(item.createTime);

    return {
      projectName: item.projectName || '—',
      projectCategory: item.projectCategory || '',
      status: item.status || '待审核',
      statusClass: statusClassMap[item.status] || 'pending',
      pointsText: formatScore(item.points),
      reason: item.reason || '',
      rejectRemark: item.rejectRemark || '',
      fileIDs,
      fileNames,
      createTime: normalizeDate(item.createTime)?.getTime() || null,
      reviewTime: normalizeDate(item.reviewTime)?.getTime() || null,
      latestTime: latestTime?.getTime() || null,
      latestTimeFormatted: formatDateTime(latestTime),
      createTimeFormatted: formatDateTime(normalizeDate(item.createTime))
    };
  });

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageList = formatted.slice(start, end);

  const groupConfig = [
    { status: '待审核', label: '待审核' },
    { status: '已通过', label: '已通过' },
    { status: '已驳回', label: '已驳回' }
  ];
  const groups = groupConfig
    .map(cfg => ({
      status: cfg.status,
      label: cfg.label,
      list: formatted.filter(item => item.status === cfg.status)
    }))
    .filter(group => group.list.length > 0);

  // 使用过滤后的实际数量作为 total
  const actualTotal = filtered.length;
  
  return {
    page,
    pageSize,
    total: actualTotal,
    list: pageList,
    groups
  };
}

async function createApplication(openid, payload) {
  const {
    projectId = '',
    projectName = '',
    phone = '',
    reason = '',
    fileIDs = [],
    fileNames = [],
    points = 0
  } = payload || {};

  if (!projectId || !projectName) {
    throw new Error('缺少项目信息');
  }
  if (!phone || !reason) {
    throw new Error('请填写完整信息');
  }
  const safeFiles = Array.isArray(fileIDs) ? fileIDs.slice(0, 3) : [];
  if (!safeFiles.length) {
    throw new Error('请上传附件');
  }

  const projectRes = await db.collection('activities')
    .doc(projectId)
    .field({ name: true, category: true, score: true })
    .get();
  if (!projectRes.data) {
    throw new Error('项目不存在');
  }

  const scoreOptions = normalizeScore(projectRes.data.score);
  const validPoints = scoreOptions.includes(points) ? points : scoreOptions[0] || points;

  const userRes = await db.collection('users')
    .where({ _openid: openid })
    .field({ name: true, studentId: true, phone: true })
    .limit(1)
    .get();
  const user = userRes.data?.[0] || {};

  // 确保申请人信息完整，如果用户信息不完整则抛出错误
  const applicantName = user.name || '';
  const applicantStudentId = user.studentId || '';
  
  if (!applicantName) {
    throw new Error('无法获取申请人姓名，请先完成用户绑定');
  }
  if (!applicantStudentId) {
    throw new Error('无法获取学号，请先完成用户绑定');
  }

  const formattedFileNames = Array.isArray(fileNames) && fileNames.length
    ? fileNames.slice(0, 3)
    : safeFiles.map((_, idx) => `附件${idx + 1}`);

  const res = await db.collection('applications').add({
    data: {
      projectId,
      projectName: projectRes.data.name || projectName,
      projectCategory: projectRes.data.category || '',
      name: applicantName,
      studentId: applicantStudentId,
      phone,
      reason,
      fileIDs: safeFiles,
      fileNames: formattedFileNames,
      studentOpenId: openid,
      points: validPoints || 0,
      status: '待审核',
      createTime: new Date()
    }
  });

  return { applicationId: res._id };
}

async function getFileUrl(openid, { fileID }) {
  if (!fileID) {
    throw new Error('缺少 fileID');
  }

  const appRes = await db.collection('applications')
    .where({ studentOpenId: openid, fileIDs: _.elemMatch(_.eq(fileID)) })
    .limit(1)
    .field({ _id: true })
    .get();
  if (!appRes.data || !appRes.data.length) {
    throw new Error('无权限访问该附件');
  }

  const fileRes = await cloud.getTempFileURL({
    fileList: [fileID]
  });

  const info = fileRes?.fileList?.[0];
  if (!info || info.status !== 0) {
    throw new Error(info?.errMsg || '获取临时链接失败');
  }

  return {
    fileID,
    tempFileURL: info.tempFileURL,
    expires: info.maxAge || 0
  };
}

async function bindStudentProfile(openid, { name = '', studentId = '' }) {
  if (!name || !studentId) {
    throw new Error('请填写完整信息');
  }

  // 验证学号格式（可选，根据实际需求调整）
  if (!/^\d+$/.test(studentId.trim())) {
    throw new Error('学号格式不正确，请输入数字');
  }

  const usersCollection = db.collection('users');
  const existing = await usersCollection.where({ _openid: openid }).get();
  if (existing.data && existing.data.length) {
    await usersCollection.doc(existing.data[0]._id).update({
      data: {
        name: name.trim(),
        studentId: studentId.trim()
      }
    });
  } else {
    await usersCollection.add({
      data: {
        _openid: openid,
        name: name.trim(),
        studentId: studentId.trim(),
        role: 'student',
        totalPoints: 0,
        createdAt: new Date()
      }
    });
  }

  return { bound: true };
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

function normalizeScore(score) {
  if (!score && score !== 0) return [];
  if (Array.isArray(score)) {
    return score.map(item => Number(item)).filter(num => Number.isFinite(num) && num >= 0);
  }
  const single = Number(score);
  return Number.isFinite(single) ? [single] : [];
}