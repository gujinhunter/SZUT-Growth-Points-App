// pages/myPoints/myPoints.js
const db = wx.cloud.database();

Page({
  data: {
    totalPoints: 0,
    averagePoints: 0,
    rank: '-',
    detail: []
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    // 页面显示时也刷新数据，确保查看后返回能看到最新积分
    this.loadData();
  },

  loadData() {
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      const openid = res.result.openid;

      // 获取用户总积分
      db.collection('users').where({ _openid: openid }).get().then(r => {
        if (r.data.length) {
          const u = r.data[0];
          this.setData({ totalPoints: u.totalPoints || 0 });
        }
      });

      // 获取积分明细（已通过的申请）
      db.collection('applications')
        .where({ studentOpenId: openid, status: '已通过' })
        .orderBy('createTime', 'desc')
        .get()
        .then(r => {
          const details = r.data.map(a => ({
            projectName: a.projectName,
            points: a.points || 0,
            createTime: a.createTime ? new Date(a.createTime).toLocaleString() : ''
          }));
          this.setData({ detail: details });
        });

      // 计算学院平均分与排名
      db.collection('users').orderBy('totalPoints', 'desc').get().then(r => {
        const list = r.data;
        const avg = list.reduce((s, i) => s + (i.totalPoints || 0), 0) / Math.max(1, list.length);
        const rank = list.findIndex(x => x._openid === openid) + 1;
        this.setData({
          averagePoints: Math.round(avg),
          rank: rank || '-'
        });
      });
    });
  }
});