const cloud = require('wx-server-sdk');
const os = require('os');
const path = require('path');
const Excel = require('exceljs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;
const DAY = 24 * 60 * 60 * 1000;

function resolveRange(range) {
  const now = new Date();
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
  const start = new Date(now.getTime() - (days - 1) * DAY);
  return { start, end: now, days };
}

function toDateKey(date) {
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${mm}-${dd}`;
}

exports.main = async (event) => {
  const { range = '最近30天', category = '' } = event || {};
  const { start, end, days } = resolveRange(range);
  const match = {
    createTime: _.and(_.gte(start), _.lte(end))
  };
  if (category) {
    match.projectCategory = category;
  }

  const applications = db.collection('applications');

  const summaryAgg = await applications.aggregate()
    .match(match)
    .group({
      _id: '$status',
      count: $.sum(1)
    })
    .end();

  const counters = summaryAgg.list || [];
  const total = counters.reduce((sum, item) => sum + item.count, 0);
  const approved = counters.find(item => item._id === '已通过')?.count || 0;
  const rejected = counters.find(item => item._id === '已驳回')?.count || 0;
  const pending = counters.find(item => item._id === '待审核')?.count || 0;

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
    const map = {};
    (item.data || []).forEach(s => { map[s.status] = s.count; });
    trendMap.set(item._id, map);
  });

  const trendRows = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start.getTime() + i * DAY);
    const key = toDateKey(date);
    const item = trendMap.get(key) || {};
    trendRows.push({
      date: key,
      pending: item['待审核'] || 0,
      approved: item['已通过'] || 0,
      rejected: item['已驳回'] || 0
    });
  }

  const pieAgg = await applications.aggregate()
    .match(match)
    .group({
      _id: '$projectName',
      count: $.sum(1)
    })
    .sort({ count: -1 })
    .limit(10)
    .end();
  const pieRows = pieAgg.list || [];

  const logsAgg = await db.collection('reviewLogs').aggregate()
    .match({ createTime: _.exists(true) })
    .sort({ createTime: -1 })
    .limit(50)
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
      adminName: $.arrayElemAt(['$adminInfo.name', 0]),
      projectName: $.arrayElemAt(['$applicationInfo.projectName', 0])
    })
    .end();
  const logRows = logsAgg.list || [];

  const workbook = new Excel.Workbook();
  const infoSheet = workbook.addWorksheet('概览');
  infoSheet.columns = [
    { header: '指标', key: 'metric', width: 20 },
    { header: '值', key: 'value', width: 20 }
  ];
  infoSheet.addRow({ metric: '统计区间', value: range });
  infoSheet.addRow({ metric: '总申请量', value: total });
  infoSheet.addRow({ metric: '待审核', value: pending });
  infoSheet.addRow({ metric: '已通过', value: approved });
  infoSheet.addRow({ metric: '已驳回', value: rejected });
  infoSheet.addRow({
    metric: '通过率',
    value: total ? `${(approved / total * 100).toFixed(1)}%` : '0%'
  });
  infoSheet.addRow({
    metric: '驳回率',
    value: total ? `${(rejected / total * 100).toFixed(1)}%` : '0%'
  });

  const trendSheet = workbook.addWorksheet('趋势');
  trendSheet.columns = [
    { header: '日期', key: 'date', width: 12 },
    { header: '待审核', key: 'pending', width: 12 },
    { header: '已通过', key: 'approved', width: 12 },
    { header: '已驳回', key: 'rejected', width: 12 }
  ];
  trendRows.forEach(row => trendSheet.addRow(row));

  const pieSheet = workbook.addWorksheet('热门项目');
  pieSheet.columns = [
    { header: '项目名称', key: 'project', width: 25 },
    { header: '申请量', key: 'count', width: 12 }
  ];
  pieRows.forEach(item => pieSheet.addRow({
    project: item._id || '未命名项目',
    count: item.count
  }));

  const logSheet = workbook.addWorksheet('操作日志');
  logSheet.columns = [
    { header: '管理员', key: 'admin', width: 16 },
    { header: '操作', key: 'action', width: 12 },
    { header: '项目', key: 'project', width: 25 },
    { header: '时间', key: 'time', width: 22 }
  ];
  logRows.forEach(item => logSheet.addRow({
    admin: item.adminName || '',
    action: item.action,
    project: item.projectName || '',
    time: item.createTime ? new Date(item.createTime).toLocaleString() : ''
  }));

  const tempPath = path.join(os.tmpdir(), `statistics-${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(tempPath);

  const uploadRes = await cloud.uploadFile({
    cloudPath: `exports/statistics-${Date.now()}.xlsx`,
    filePath: tempPath
  });

  return { fileID: uploadRes.fileID };
};