// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw new Error('缺少OPENID');

    const profile = await getProfile(OPENID);
    return { success: true, data: profile };
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
  return {
    openid,
    name: user?.name || '',
    studentId: user?.studentId || '',
    phone: user?.phone || '',
    academy: user?.academy || '',
    className: user?.className || '',
    role: user?.role || 'student'
  };
}