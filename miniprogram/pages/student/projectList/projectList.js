// pages/projectList/projectList.js
const PROJECT_SERVICE = 'studentProjectService';

Page({
  data: {
    activities: [],
    loading: true,
    activeCategory: null
  },

  onLoad() {
    this.loadActivities();
  },

  async loadActivities() {
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: PROJECT_SERVICE,
        data: { action: 'listProjects', payload: { page: 1, pageSize: 200 } }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '项目加载失败');
      }
      const list = result.data?.list || [];
      this.setData({ activities: list, loading: false });
    } catch (err) {
      console.error('加载项目失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ activities: [], loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  toggleCategory(e) {
    const { category } = e.currentTarget.dataset;
    this.setData({
      activeCategory: this.data.activeCategory === category ? null : category
    });
  },

  goToApply(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/student/apply/apply?projectId=${item._id}&projectName=${item.name}`
    });
  }
});
