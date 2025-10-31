// cloudfunctions/exportExport/index.js
const cloud = require('wx-server-sdk');
cloud.init();


const db = cloud.database();
const fs = require('fs');
const path = require('path');

exports.main = async (event, context) => {
  // 简单示例：导出 users 排行为 CSV，并把文件上传到云存储返回 fileID
  const users = await db.collection('users').orderBy('totalPoints','desc').get().then(r => r.data);
  const headers = ['name','studentId','totalPoints'];
  const rows = users.map(u => [u.name || '', u.studentId || '', u.totalPoints || 0].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');

  // 写入 /tmp 文件
  const filename = `/tmp/users_rank_${Date.now()}.csv`;
  fs.writeFileSync(filename, csv);

  // 上传到云存储
  const cloudPath = `exports/users_rank_${Date.now()}.csv`;
  // 注意：在某些云环境中需要使用 cloud.uploadFile（wx-server-sdk 提供）
  try {
    const result = await cloud.uploadFile({
      cloudPath,
      fileContent: fs.readFileSync(filename)
    });
    // 返回 fileID
    return { success: true, fileID: result.fileID };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
