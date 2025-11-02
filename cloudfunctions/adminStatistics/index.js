const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const DAY = 24 * 60 * 60 * 1000;

/** 根据传入区间名计算起止时间 */
function resolveRange(range) {
  const now = new Date();
  const end = now;
  let days = 30;
  switch (range) {
    case '最近7天':
      days = 7;
      break;
    case '本学期':
      days = 120;
      break;
    case '本年':
      days = 365;
      break;
    default:
      days = 30;
  }
  const start = new Date(end.getTime() - (days - 1) * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  const prevEnd = new Date(start.getTime() - 1);
  return { start, end, prevStart, prevEnd, days };
}

function toDateKey(date) {
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${mm}-${dd}`;
}

function ensureSeries(start, days, rawMap) {
  const arr = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * DAY);
    const key = toDateKey(date);
    const item = rawMap.get(key) || {};
    arr.push({
      date: key,
      pending: item.pending || 0,
      approved: item.approved || 0,
      rejected: item.rejected || 0
    });
  }
  return arr;
}

exports.main = async (event) => {
  const { range = '最近30天', category = '' } = event || {};
  const { start, end, prevStart, prevEnd, days } = resolveRange(range);

  const match = {
    createTime: _.and(_.gte(start), _.lte(end))
  };
  if (category) {
    match.projectCategory = category;
  }

  const prevMatch = {
    createTime: _.and(_.gte(prevStart), _.lte(prevEnd))
  };
  if (category) {
    prevMatch.projectCategory = category;
  }

  const applications = db.collection('applications');

  /** 汇总统计 */
  const summaryAgg = await applications.aggregate()
    .match(match)
    .group({
      _id: '$status',
      count: $.sum(1)
    })
    .end();
  const counters = summaryAgg.list || [];
  const total = counters.reduce((sum, item) => sum + item.count, 0);
  const approvedCount = counters.find(item => item._id === '已通过')?.count || 0;
  const rejectedCount = counters.find(item => item._id === '已驳回')?.count || 0;

  const prevTotalAgg = await applications.aggregate()
    .match(prevMatch)
    .group({
      _id: null,
      count: $.sum(1)
    })
    .end();
  const prevTotal = prevTotalAgg.list?.[0]?.count || 0;
  const applicationRise = prevTotal
    ? ((total - prevTotal) / prevTotal * 100).toFixed(1)
    : total > 0 ? 100 : 0;

  const summary = {
    totalApplications: total,
    approvedCount,
    rejectedCount,
    approvalRate: total ? (approvedCount / total * 100).toFixed(1) : 0,
    rejectRate: total ? (rejectedCount / total * 100).toFixed(1) : 0,
    applicationRise,
    range
  };

  /** 折线图数据 */
  const trendAgg = await applications.aggregate()
    .match(match)
    .addFields({
      dateStr: $.dateToString({
        date: '$createTime',
        format: '%m-%d',
        timezone: 'Asia/Shanghai'
      })
    })
    .group({
      _id: { date: '$dateStr', status: '$status' },
      count: $.sum(1)
    })
    .group({
      _id: '$_id.date',
      data: $.push({
        status: '$_id.status',
        count: '$count'
      })
    })
    .end();

  const trendMap = new Map();
  (trendAgg.list || []).forEach(item => {
    const statuses = {};
    item.data.forEach(s => { statuses[s.status] = s.count; });
    trendMap.set(item._id, statuses);
  });
  const trend = ensureSeries(start, days, trendMap);

  /** 饼图：项目热度 */
  const pieAgg = await applications.aggregate()
    .match(match)
    .group({
      _id: '$projectName',
      count: $.sum(1)
    })
    .sort({ count: -1 })
    .limit(5)
    .end();
  const pie = (pieAgg.list || []).map(item => ({
    project: item._id || '未命名项目',
    count: item.count
  }));

  /** 审核日志 */
  const logsAgg = await db.collection('reviewLogs').aggregate()
    .sort({ createTime: -1 })
    .limit(30)
    .lookup({
      from: 'users',
      localField: 'adminOpenId',
      foreignField: '_openid',
      as: 'adminInfo'
    })
    .lookup({
      from: 'applications',
      localField: 'applicationId',
      foreignField: '_id',
      as: 'applicationInfo'
    })
    .project({
      action: 1,
      createTime: 1,
      adminOpenId: 1,
      adminName: $.arrayElemAt(['$adminInfo.name', 0]),
      projectName: $.arrayElemAt(['$applicationInfo.projectName', 0])
    })
    .end();

  const logs = (logsAgg.list || []).map(item => ({
    _id: item._id,
    adminName: item.adminName || '',
    projectName: item.projectName || '',
    action: item.action,
    createTime: item.createTime
  }));

  return { summary, trend, pie, logs };
};