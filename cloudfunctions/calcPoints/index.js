// cloudfunctions/calcPoints/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  // 该函数重新计算所有用户 totalPoints（汇总 applications 中 status === 'approved' 的分数）
  const users = await db.collection('users').get().then(r => r.data);
  for (const u of users) {
    // 聚合：读取该用户所有 approved applications 并求和
    const appls = await db.collection('applications').where({
      studentOpenId: u._openid,
      status: 'approved'
    }).get().then(r => r.data);
    const total = appls.reduce((s,a) => s + (a.points || 0), 0);
    try {
      await db.collection('users').doc(u._id).update({ data: { totalPoints: total } });
    } catch (e) {
      // 如果没有 _id，也可以用 where + update（此处假定有 _id）
    }
  }
  // 可继续计算并写入某个排行榜集合
  return { success: true };
};
