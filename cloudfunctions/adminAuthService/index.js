// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

class AuthError extends Error {
  constructor(message, code = 'AUTH_DENIED') {
    super(message);
    this.code = code;
  }
}

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext();
    const action = event?.action || 'getProfile';

    switch (action) {
      case 'ensureAdmin':
        await ensureAdmin(OPENID);
        return { success: true };

      case 'registerAdmin':
        return { success: true, data: await registerAdmin(OPENID, event.payload || {}) };

      case 'getProfile':
      default: {
        const profile = await getProfile(OPENID);
        return { success: true, data: profile };
      }
    }
  } catch (err) {
    console.error('adminAuthService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function ensureAdmin(openid) {
  const profile = await getProfile(openid);
  if (profile.role !== 'admin') {
    throw new AuthError('无管理员权限');
  }
  return profile;
}

async function getProfile(openid) {
  if (!openid) {
    throw new AuthError('缺少 OPENID');
  }
  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({ name: true, role: true, studentId: true, academy: true, className: true })
    .limit(1)
    .get();
  const user = res.data?.[0] || null;
  return {
    openid,
    name: user?.name || '管理员',
    role: user?.role || 'guest',
    studentId: user?.studentId || '',
    academy: user?.academy || '',
    className: user?.className || ''
  };
}

async function registerAdmin(openid, payload = {}) {
  const name = (payload.name || '').trim();
  const adminWorkId = (payload.workId || payload.adminWorkId || '').trim();
  if (!name || !adminWorkId) {
    throw new Error('请填写姓名和工号');
  }

  const whitelistRes = await db.collection('adminWhitelist')
    .where({ name, adminWorkId })
    .limit(1)
    .get();
  const entry = whitelistRes.data?.[0];
  if (!entry) {
    throw new AuthError('未在管理员白名单中');
  }

  const usersCollection = db.collection('users');
  const existing = await usersCollection.where({ _openid: openid }).limit(1).get();
  const now = new Date();
  if (existing.data && existing.data.length) {
    await usersCollection.doc(existing.data[0]._id).update({
      data: {
        name,
        studentId: adminWorkId,
        adminWorkId,
        role: 'admin',
        updatedAt: now
      }
    });
  } else {
    await usersCollection.add({
      data: {
        _openid: openid,
        name,
        studentId: adminWorkId,
        adminWorkId,
        role: 'admin',
        createdAt: now,
        updatedAt: now
      }
    });
  }

  return { openid, role: 'admin' };
}