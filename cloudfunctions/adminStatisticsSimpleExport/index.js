// cloudfunctions/adminStatisticsSimpleExport/index.js
const cloud = require('wx-server-sdk');
const ExcelJS = require('exceljs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const db = cloud.database();
  const MAX_LIMIT = 100;

  const countRes = await db.collection('users').count();
  const total = countRes.total || 0;
  const tasks = [];
  for (let i = 0; i < Math.ceil(total / MAX_LIMIT); i++) {
    tasks.push(
      db.collection('users')
        .skip(i * MAX_LIMIT)
        .limit(MAX_LIMIT)
        .field({
          name: true,
          studentId: true,
          totalPoints: true,
          className: true,
          academy: true
        })
        .get()
    );
  }
  const results = await Promise.all(tasks);
  const list = results.flatMap(res => res.data || []);
  list.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('积分排行榜');

  sheet.columns = [
    { header: '排名', key: 'rank', width: 10 },
    { header: '姓名', key: 'name', width: 16 },
    { header: '学号', key: 'studentId', width: 18 },
    { header: '学院', key: 'academy', width: 20 },
    { header: '班级', key: 'className', width: 18 },
    { header: '总积分', key: 'totalPoints', width: 12 }
  ];

  list.forEach((item, index) => {
    sheet.addRow({
      rank: index + 1,
      name: item.name || '',
      studentId: item.studentId || '',
      academy: item.academy || '',
      className: item.className || '',
      totalPoints: item.totalPoints || 0
    });
  });

  sheet.getRow(1).font = { bold: true };
  sheet.eachRow({ includeEmpty: false }, row => {
    row.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const uploadRes = await cloud.uploadFile({
    cloudPath: `exports/积分排行榜_${Date.now()}.xlsx`,
    fileContent: buffer
  });

  return {
    fileID: uploadRes.fileID,
    total
  };
};