// pages/myPoints/myPoints.js
const db = wx.cloud.database();

const _ = db.command;

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

  async loadData() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openid = res.result?.openid;
      if (!openid) throw new Error('missing openid');

      const userInfo = await this.loadUserTotalPoints(openid);
      await Promise.all([
        this.loadApplicationDetails(openid),
        this.loadAverageAndRank(openid, userInfo?.role || '')
      ]);
    } catch (err) {
      console.error('积分数据加载失败', err);
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    }
  },

  async loadUserTotalPoints(openid) {
    try {
      const res = await db.collection('users')
        .where({ _openid: openid })
        .field({ totalPoints: true, role: true })
        .get();
      const user = res.data?.[0];
      this.setData({ totalPoints: user?.totalPoints || 0 });
      return user || null;
    } catch (err) {
      console.error('加载用户积分失败', err);
      this.setData({ totalPoints: 0 });
      return null;
    }
  },

  async loadApplicationDetails(openid) {
    try {
      const MAX_LIMIT = 100;
      const where = { studentOpenId: openid, status: '已通过' };
      const countRes = await db.collection('applications').where(where).count();
      const total = countRes.total || 0;

      if (total === 0) {
        this.setData({ detail: [] });
        return;
      }

      const tasks = [];
      const batches = Math.ceil(total / MAX_LIMIT);
      for (let i = 0; i < batches; i++) {
        tasks.push(
          db.collection('applications')
            .where(where)
            .orderBy('createTime', 'desc')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .get()
        );
      }
      const results = await Promise.all(tasks);
      const list = results.flatMap(r => r.data || []);
      list.sort((a, b) => {
        const timeA = new Date(a.createTime || 0).getTime();
        const timeB = new Date(b.createTime || 0).getTime();
        return timeB - timeA;
      });

      const details = list.map(a => ({
        projectName: a.projectName,
        points: a.points || 0,
        createTime: this.formatDateTime(a.createTime)
      }));
      this.setData({ detail: details });
    } catch (err) {
      console.error('加载积分明细失败', err);
      this.setData({ detail: [] });
    }
  },

  async loadAverageAndRank(openid, role) {
    try {
      const MAX_LIMIT = 100;
      const baseQuery = db.collection('users').where({ role: _.neq('admin') });
      const countRes = await baseQuery.count();
      const total = countRes.total || 0;

      let nonAdminList = [];
      if (total > 0) {
        const tasks = [];
        const batches = Math.ceil(total / MAX_LIMIT);
        for (let i = 0; i < batches; i++) {
          tasks.push(
            baseQuery
              .skip(i * MAX_LIMIT)
              .limit(MAX_LIMIT)
              .field({ totalPoints: true, _openid: true })
              .get()
          );
        }
        const results = await Promise.all(tasks);
        nonAdminList = results.flatMap(res => res.data || []);
      }

      nonAdminList.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
      const totalPointsSum = nonAdminList.reduce((sum, item) => sum + (item.totalPoints || 0), 0);
      const avg = nonAdminList.length ? totalPointsSum / nonAdminList.length : 0;

      let rank = '-';
      if (role !== 'admin') {
        const myEntry = nonAdminList.find(item => item._openid === openid);
        if (myEntry) {
          const myPoints = myEntry.totalPoints || 0;
          const higherCount = nonAdminList.filter(item => (item.totalPoints || 0) > myPoints).length;
          rank = higherCount + 1;
        }
      }

      this.setData({
        averagePoints: Math.round(avg) || 0,
        rank
      });
    } catch (err) {
      console.error('计算平均分和排名失败', err);
      this.setData({
        averagePoints: 0,
        rank: '-'
      });
    }
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