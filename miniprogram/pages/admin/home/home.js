const AUTH_SERVICE = 'adminAuthService';
const DASHBOARD_SERVICE = 'adminDashboardService';

Page({
  data: {
    adminName: '',
    today: '',
    metrics: {
      pendingTotal: 0,
      totalProjects: 0,
      approvalRate: '0.0'
    },
    loading: false
  },

  async onLoad() {
    this.setData({ today: this.formatDate(new Date()) });
    const ok = await this.ensureAdmin();
    if (ok) {
      this.loadOverview();
    }
  },

  onShow() {
    if (this.data.adminName) {
      this.loadOverview();
    }
  },

  onPullDownRefresh() {
    this.loadOverview().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAdmin() {
    try {
      const res = await wx.cloud.callFunction({
        name: AUTH_SERVICE,
        data: { action: 'getProfile' }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '身份校验失败');
      }
      const profile = result.data || {};
      if (profile.role !== 'admin') {
        wx.showModal({
          title: '无权限',
          content: '当前帐号没有管理员权限',
          showCancel: false,
          success: () => wx.navigateBack()
        });
        return false;
      }
      this.setData({ adminName: profile.name || '管理员' });
      return true;
    } catch (err) {
      console.error('管理员身份校验失败', err);
      wx.showToast({ title: err.message || '身份校验失败', icon: 'none' });
      return false;
    }
  },

  async loadOverview() {
    if (!this.data.adminName) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: DASHBOARD_SERVICE,
        data: { action: 'getOverview' }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '概览获取失败');
      }
      const data = result.data || {};
      this.setData({
        metrics: {
          pendingTotal: data.pendingTotal || 0,
          totalProjects: data.totalProjects || 0,
          approvalRate: Number(data.approvalRate || 0).toFixed(1)
        }
      });
    } catch (err) {
      console.error('概览数据加载失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
});