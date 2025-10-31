// cloudfunctions/calcPoints/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();
// 像这里就是导入了数据库，所以就必须先cloud.init()

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

// 1.async 函数执行流程的说明：
// async 函数会先执行到第一个 await 之前的所有同步语句；
// 遇到 await 时会暂停当前函数，等待后面的 Promise 变为 fulfilled 或 rejected 再继续执行；
// await 不会阻塞整个线程，只是把后续逻辑放入微任务队列等待调度。


// 2.calcPoints 云函数的说明：
// async 函数入口，可用 await 控制异步流程；
// 先查询 users 集合拿到全部用户；
// 遍历用户时，再查询 applications 集合中该用户已审核通过的记录；
// 用 reduce 汇总这些申请的 points，缺失值按 0 处理；
// 将总积分写回用户文档，若 update 失败则由 try...catch 吞掉；
// 所有用户处理完后返回 { success: true } 表示执行成功。

