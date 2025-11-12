// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

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

    const action = event?.action || 'getOverview';
    switch (action) {
      case 'getOverview':
        return { success: true, data: await getOverview() };
      default:
        throw new Error(`未知操作: ${action}`);
    }
  } catch (err) {
    console.error('adminDashboardService error', err);
    return {
      success: false,
      code: err.code || 'SERVER_ERROR',
      message: err.message || '服务器异常，请稍后再试'
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

async function getOverview() {
  const pendingPromise = db.collection('applications')
    .where({ status: '待审核' })
    .count();

  const projectPromise = db.collection('activities').count();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentTotalPromise = db.collection('applications')
    .where({ createTime: _.gte(thirtyDaysAgo) })
    .count();
  const recentApprovedPromise = db.collection('applications')
    .where({ createTime: _.gte(thirtyDaysAgo), status: '已通过' })
    .count();

  const [pendingRes, projectRes, recentTotalRes, recentApprovedRes] = await Promise.all([
    pendingPromise,
    projectPromise,
    recentTotalPromise,
    recentApprovedPromise
  ]);

  const totalRecent = recentTotalRes.total || 0;
  const recentApproved = recentApprovedRes.total || 0;
  const approvalRate = totalRecent > 0 ? Number(((recentApproved / totalRecent) * 100).toFixed(1)) : 0;

  return {
    pendingTotal: pendingRes.total || 0,
    totalProjects: projectRes.total || 0,
    approvalRate
  };
}