// pages/myPoints/myPoints.js
const POINTS_SERVICE = 'studentPointsService';

Page({
  data: {
    loading: true,
    totalPoints: 0,
    averagePoints: 0,
    rank: '-',
    detail: []
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData();
  },

  async loadData() {
    try {
      this.setData({ loading: true });
      wx.showLoading({ title: '加载中...' });

      const summary = await callPointsService('getSummary');
      this.setData({
        totalPoints: summary?.totalPoints || 0,
        averagePoints: summary?.averagePoints || 0,
        rank: summary?.rank ?? '-'
      });

      const detailRes = await callPointsService('listDetails', { page: 1, pageSize: 200 });
      const details = (detailRes?.list || []).map(item => ({
        projectName: item.projectName,
        points: item.points || 0,
        createTime: this.formatDateTime(item.createTime)
      }));
      this.setData({ detail: details });
    } catch (err) {
      console.error('积分数据加载失败', err);
      wx.showToast({ title: err.message || '数据加载失败', icon: 'none' });
      this.setData({
        totalPoints: 0,
        averagePoints: 0,
        rank: '-',
        detail: []
      });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },

  formatDateTime(time) {
    if (!time) return '';
    const date = new Date(time);
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

async function callPointsService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: POINTS_SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}