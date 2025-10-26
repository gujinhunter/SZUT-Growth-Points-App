// cloudfunctions/updateStatus/index.js
const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  // event: { applicationId, status: 'approved'|'rejected', remark? }
  const { applicationId, status, remark } = event;
  if (!applicationId || !status) {
    return { success: false, msg: '参数不足' };
  }
  // 获取申请
  const appl = await db.collection('applications').doc(applicationId).get().then(r=>r.data).catch(()=>null);
  if (!appl) return { success:false, msg:'申请不存在' };

  // 更新申请状态
  await db.collection('applications').doc(applicationId).update({
    data: {
      status,
      remark: remark || '',
      reviewedAt: db.serverDate()
    }
  });

  // 若通过则给该用户加分（记录每条申请的 points 字段）
  if (status === 'approved') {
    // 获取项目定义分值
    const proj = await db.collection('projects').doc(appl.projectId).get().then(r=>r.data).catch(()=>null);
    const points = (proj && proj.points) ? proj.points : (appl.points || 0);
    // 更新该申请记录的 points
    await db.collection('applications').doc(applicationId).update({
      data: { points }
    });
    // 给 user.totalPoints 增加
    // users 集合以 openid 为 _openid 关联
    const userRef = db.collection('users').where({ _openid: appl.studentOpenId });
    const userDoc = await userRef.get().then(r=>r.data[0]);
    if (userDoc) {
      const newTotal = (userDoc.totalPoints || 0) + points;
      // update first match
      await db.collection('users').doc(userDoc._id).update({ data: { totalPoints: newTotal } });
    }
  }

  // 推荐：调用 calcPoints 重新计算排名（可选）
  try {
    await cloud.callFunction({ name: 'calcPoints' });
  } catch (e) {
    // ignore
  }

  return { success: true };
};
