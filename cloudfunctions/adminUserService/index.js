// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const USERS_COLLECTION = 'users';
const ARCHIVE_COLLECTION = 'userArchives';
const LOG_COLLECTION = 'adminOperationLogs';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class AuthError extends Error {
  constructor(message, code = 'AUTH_DENIED') {
    super(message);
    this.code = code;
  }
}

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const admin = await ensureAdmin(OPENID);

    const action = event?.action || 'listUsers';
    const payload = event?.payload || {};

    switch (action) {
      case 'listUsers':
        return { success: true, data: await listUsers(payload) };

      case 'unbindUser':
        return { success: true, data: await unbindUser(admin, payload) };

      case 'deleteUser':
        return { success: true, data: await deleteUser(admin, payload) };

      case 'updateRole':
        return { success: true, data: await updateRole(admin, payload) };

      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('adminUserService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function ensureAdmin(openid) {
  if (!openid) {
    throw new AuthError('缺少 OPENID');
  }
  const res = await db.collection(USERS_COLLECTION)
    .where({ _openid: openid })
    .field({ name: true, role: true })
    .limit(1)
    .get();
  const user = res.data?.[0];
  if (!user || user.role !== 'admin') {
    throw new AuthError('无管理员权限');
  }
  return {
    userId: user._id,
    name: user.name || '管理员',
    role: 'admin',
    openid
  };
}

async function listUsers(payload = {}) {
  let { page = 1, pageSize = DEFAULT_PAGE_SIZE, keyword = '', role = '' } = payload;
  page = Math.max(1, Number(page) || 1);
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, Number(pageSize) || DEFAULT_PAGE_SIZE));

  const conditions = [];
  if (role) {
    conditions.push({ role });
  }
  const trimmedKeyword = (keyword || '').trim();
  if (trimmedKeyword) {
    const reg = db.RegExp({ regexp: trimmedKeyword, options: 'i' });
    conditions.push(_.or([
      { name: reg },
      { studentId: reg },
      { phone: reg },
      { academy: reg },
      { className: reg }
    ]));
  }

  let query = db.collection(USERS_COLLECTION);
  if (conditions.length === 1) {
    query = query.where(conditions[0]);
  } else if (conditions.length > 1) {
    query = query.where(_.and(conditions));
  }

  const totalRes = await query.count();
  const total = totalRes.total || 0;

  const listRes = await query
    .orderBy('_id', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  const list = (listRes.data || []).map(formatUser);
  return { list, page, pageSize, total };
}

async function unbindUser(admin, payload = {}) {
  return removeUserRecord(admin, payload, { archive: true, action: 'UNBIND_USER' });
}

async function deleteUser(admin, payload = {}) {
  return removeUserRecord(admin, payload, { archive: false, action: 'DELETE_USER' });
}

async function removeUserRecord(admin, payload = {}, options = {}) {
  const { userId } = payload;
  if (!userId) {
    throw new Error('缺少 userId');
  }
  if (admin.userId === userId) {
    throw new Error('不能操作当前登录账号');
  }

  const docRes = await db.collection(USERS_COLLECTION).doc(userId).get();
  if (!docRes.data) {
    throw new Error('用户不存在或已被处理');
  }
  const user = { ...docRes.data, _id: userId };

  if (options.archive) {
    await db.collection(ARCHIVE_COLLECTION).add({
      data: {
        sourceUserId: userId,
        snapshot: {
          name: user.name || '',
          studentId: user.studentId || '',
          phone: user.phone || '',
          academy: user.academy || '',
          className: user.className || '',
          role: user.role || '',
          totalPoints: user.totalPoints || 0
        },
        operatorOpenId: admin.openid,
        operatorName: admin.name || '',
        action: options.action || 'UNBIND_USER',
        archivedAt: new Date()
      }
    });
  }

  await db.collection(USERS_COLLECTION).doc(userId).remove();
  await recordOperation(admin, options.action || 'UNBIND_USER', user, {});
  return { userId };
}

async function updateRole(admin, payload = {}) {
  const { userId, role } = payload;
  if (!userId || !role) {
    throw new Error('缺少必要参数');
  }
  if (!['student', 'admin'].includes(role)) {
    throw new Error('角色不支持');
  }
  if (admin.userId === userId && role !== 'admin') {
    throw new Error('不能移除自己的管理员权限');
  }

  const docRes = await db.collection(USERS_COLLECTION).doc(userId).get();
  if (!docRes.data) {
    throw new Error('用户不存在');
  }
  const user = { ...docRes.data, _id: userId };

  await db.collection(USERS_COLLECTION).doc(userId).update({
    data: {
      role,
      updatedAt: new Date()
    }
  });

  await recordOperation(admin, 'UPDATE_ROLE', user, { toRole: role });
  return { userId, role };
}

async function recordOperation(admin, action, targetUser = {}, extra = {}) {
  try {
    await db.collection(LOG_COLLECTION).add({
      data: {
        action,
        operatorOpenId: admin.openid,
        operatorName: admin.name || '',
        targetUserId: targetUser._id || '',
        targetName: targetUser.name || '',
        targetStudentId: targetUser.studentId || '',
        extra,
        createdAt: new Date()
      }
    });
  } catch (logErr) {
    console.error('记录操作日志失败', logErr);
  }
}

function formatUser(doc = {}) {
  const createdAt = normalizeDate(doc.createdAt || doc.createTime || doc._createTime);
  const updatedAt = normalizeDate(doc.updatedAt || doc.updateTime || doc._updateTime);
  return {
    _id: doc._id,
    name: doc.name || '',
    studentId: doc.studentId || '',
    role: doc.role || 'student',
    phone: doc.phone || '',
    academy: doc.academy || '',
    className: doc.className || '',
    totalPoints: Number(doc.totalPoints || 0),
    openid: doc._openid || '',
    createdAt: createdAt ? createdAt.getTime() : null,
    updatedAt: updatedAt ? updatedAt.getTime() : null
  };
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
    const parsed = new Date(input.replace(/T/g, ' ').replace(/\//g, '-'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

