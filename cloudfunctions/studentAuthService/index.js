// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw new Error('缺少OPENID');

    const action = event.action || 'getProfile';
    const payload = event.payload || {};

    switch (action) {
      case 'getProfile': {
        const profile = await getProfile(OPENID);
        return { success: true, data: profile };
      }
      case 'updatePhone': {
        const result = await updatePhone(OPENID, payload);
        return { success: true, data: result };
      }
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('studentAuthService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function getProfile(openid) {
  const res = await db.collection('users')
    .where({ _openid: openid })
    .field({
      name: true,
      studentId: true,
      phone: true,
      academy: true,
      className: true,
      role: true
    })
    .limit(1)
    .get();
  const user = res.data?.[0] || null;
  
  // 如果用户不存在，返回 role 为空字符串，前端据此判断需要绑定
  if (!user) {
    return {
      openid,
      name: '',
      studentId: '',
      phone: '',
      academy: '',
      className: '',
      role: ''
    };
  }
  
  return {
    openid,
    name: user.name || '',
    studentId: user.studentId || '',
    phone: user.phone || '',
    academy: user.academy || '',
    className: user.className || '',
    role: user.role || ''
  };
}

async function updatePhone(openid, payload = {}) {
  const phone = (payload.phone || '').trim();
  if (!phone) {
    throw new Error('请填写联系电话');
  }
  if (!/^[\d+\-]{5,20}$/.test(phone)) {
    throw new Error('联系电话格式不正确');
  }

  const usersCollection = db.collection('users');
  const res = await usersCollection.where({ _openid: openid }).limit(1).get();
  if (!res.data || !res.data.length) {
    throw new Error('未找到绑定信息，请先完成用户绑定');
  }
  const userId = res.data[0]._id;
  await usersCollection.doc(userId).update({
    data: {
      phone,
      updatedAt: new Date()
    }
  });

  return { phone };
}