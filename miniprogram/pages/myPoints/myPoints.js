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
          this.currentUserRole = u.role || '';
        } else {
          this.currentUserRole = '';
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
            createTime: this.formatDateTime(a.createTime)
          }));
          this.setData({ detail: details });
        });

      // 计算学院平均分与排名（剔除管理员）
      db.collection('users').orderBy('totalPoints', 'desc').get().then(r => {
        const allUsers = r.data || [];
        const nonAdminList = allUsers.filter(item => item.role !== 'admin');
        const totalPointsSum = nonAdminList.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
        const avg = nonAdminList.length ? totalPointsSum / nonAdminList.length : 0;

        const myRecord = allUsers.find(user => user._openid === openid);
        const isAdmin = myRecord?.role === 'admin';
        let rank = '-';

        if (!isAdmin && myRecord) {
          const myPoints = myRecord.totalPoints || 0;
          const higherCount = nonAdminList.filter(x => (x.totalPoints || 0) > myPoints).length;
          rank = higherCount + 1;
        }

        this.setData({
          averagePoints: Math.round(avg) || 0,
          rank
        });
      });
    });
  },

  formatDateTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mi = `${date.getMinutes()}`.padStart(2, '0');
    const ss = `${date.getSeconds()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
});