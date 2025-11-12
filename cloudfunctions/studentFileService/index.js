// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  try {
    const { OPENID } = cloud.getWXContext();
    if (!OPENID) throw new Error('缺少OPENID');

    const action = event?.action || 'getUploadToken';
    const payload = event?.payload || {};

    switch (action) {
      case 'getUploadToken':
        return { success: true, data: await getUploadToken(OPENID, payload) };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('studentFileService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
    };
  }
};

async function getUploadToken(openid, { fileExt = '.jpg' }) {
  const usersRes = await db.collection('users')
    .where({ _openid: openid })
    .limit(1)
    .field({ _id: true })
    .get();
  if (!usersRes.data || !usersRes.data.length) {
    throw new Error('未找到用户信息');
  }

  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000);
  const safeExt = sanitizeExt(fileExt);
  const cloudPath = `applications/${openid}/${timestamp}_${random}${safeExt}`;

  return {
    cloudPath,
    maxSize: 5 * 1024 * 1024
  };
}

function sanitizeExt(ext) {
  if (!ext) return '.jpg';
  const lower = ext.toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.pdf', '.doc', '.docx'];
  return allowed.includes(lower) ? lower : '.jpg';
}