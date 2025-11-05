// adminOverview函数用于返回待审核的数量
const cloud = require('wx-server-sdk');
cloud.init();

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const DAY = 24 * 60 * 60 * 1000;

function toDateKey(date) {
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${mm}-${dd}`;
}

exports.main = async (event) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + DAY);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * DAY);

  // 1. 今日待审核数量
  const pendingTodayRes = await db.collection('applications')
    .where({
      status: '待审核',
      createTime: _.gte(today).and(_.lt(tomorrow))
    })
    .count();
  const pendingToday = pendingTodayRes.total || 0;

  // 2. 项目总数
  const projectsRes = await db.collection('activities').count();
  const totalProjects = projectsRes.total || 0;

  // 3. 审核通过率（最近30天）
  const recentRes = await db.collection('applications')
    .where({
      createTime: _.gte(thirtyDaysAgo)
    })
    .get();
  const total = recentRes.data.length;
  const approved = recentRes.data.filter(item => item.status === '已通过').length;
  const approvalRate = total > 0 ? (approved / total * 100) : 0;

  // 4. 最近7天趋势
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY);
    const nextDate = new Date(date.getTime() + DAY);
    const dayRes = await db.collection('applications')
      .where({
        createTime: _.gte(date).and(_.lt(nextDate))
      })
      .count();
    trend.push({
      date: toDateKey(date),
      count: dayRes.total || 0
    });
  }

  // 5. 热门项目排行（最近30天）
  const rankAgg = await db.collection('applications')
    .aggregate()
    .match({
      createTime: _.gte(thirtyDaysAgo)
    })
    .group({
      _id: '$projectName',
      count: $.sum(1)
    })
    .sort({ count: -1 })
    .limit(5)
    .end();

  const rank = (rankAgg.list || []).map(item => ({
    project: item._id || '未命名项目',
    count: item.count || 0
  }));

  return {
    pendingToday,
    totalProjects,
    approvalRate,
    trend,
    rank
  };
};