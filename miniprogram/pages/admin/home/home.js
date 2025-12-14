const AUTH_SERVICE = 'adminAuthService';
const DASHBOARD_SERVICE = 'adminDashboardService';
const PROJECT_SERVICE = 'adminProjectService';

Page({
  data: {
    adminName: '',
    today: '',
    metrics: {
      pendingTotal: 0,
      totalProjects: 0,
      approvalRate: '0.0',
      redeemToday: 0,
      redeemPending: 0
    },
    loading: false,
    announcement: null,
    announcementSheetVisible: false,
    announcementSaving: false,
    announcementForm: {
      announcementId: '',
      title: '活动资讯',
      content: '',
      expireTime: ''
    }
  },

  async onLoad() {
    this.setData({ today: this.formatDate(new Date()) });
    const ok = await this.ensureAdmin();
    if (ok) {
      this.loadOverview();
      this.loadAnnouncement();
      this.loadRedeemSummary();
    }
  },

  onShow() {
    if (this.data.adminName) {
      this.loadOverview();
      this.loadAnnouncement();
      this.loadRedeemSummary();
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

  async loadRedeemSummary() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminRewardService',
        data: { action: 'getRedeemSummary' }
      });
      const result = res.result || {};
      if (!result.success) throw new Error(result.message || '兑换统计失败');
      const data = result.data || {};
      this.setData({
        'metrics.redeemToday': data.today || 0,
        'metrics.redeemPending': data.pendingUnissued || 0
      });
    } catch (err) {
      console.error('兑换统计失败', err);
    }
  },

  async loadAnnouncement() {
    try {
      const data = await callProjectService('getAnnouncement');
      if (data) {
        const expireDate = data.expireTime ? new Date(data.expireTime) : null;
        const expireDisplay = expireDate && !Number.isNaN(expireDate.getTime())
          ? this.formatDate(expireDate)
          : '';
        this.setData({
          announcement: {
            title: data.title || '活动资讯',
            content: data.content || '',
            expireTime: expireDisplay,
            publishTime: this.formatDateTime(data.publishTime || data.updatedAt)
          },
          announcementForm: {
            announcementId: data._id || '',
            title: data.title || '活动资讯',
            content: data.content || '',
            expireTime: expireDisplay
          }
        });
      } else {
        this.setData({
          announcement: null,
          announcementForm: {
            announcementId: '',
            title: '活动资讯',
            content: '',
            expireTime: ''
          }
        });
      }
    } catch (err) {
      console.error('公告加载失败', err);
      wx.showToast({ title: '公告加载失败', icon: 'none' });
    }
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  noop() {},

  formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  formatDateTime(input) {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    const pad = n => `${n}`.padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  openAnnouncementSheet() {
    this.setData({ announcementSheetVisible: true });
  },

  closeAnnouncementSheet() {
    this.setData({ announcementSheetVisible: false, announcementSaving: false });
  },

  onAnnouncementTitleInput(e) {
    this.setData({ 'announcementForm.title': e.detail.value });
  },

  onAnnouncementContentInput(e) {
    this.setData({ 'announcementForm.content': e.detail.value });
  },

  onAnnouncementExpireInput(e) {
    this.setData({ 'announcementForm.expireTime': e.detail.value });
  },

  async saveAnnouncement() {
    if (this.data.announcementSaving) return;
    const { announcementForm } = this.data;
    const title = (announcementForm.title || '').trim() || '活动资讯';
    const content = (announcementForm.content || '').trim();
    if (!content) {
      wx.showToast({ title: '请输入公告内容', icon: 'none' });
      return;
    }
    this.setData({ announcementSaving: true });
    wx.showLoading({ title: '发布中...' });
    try {
      await callProjectService('saveAnnouncement', {
        announcementId: announcementForm.announcementId,
        title,
        content,
        expireTime: announcementForm.expireTime || null
      });
      wx.showToast({ title: '已发布', icon: 'success' });
      await this.loadAnnouncement();
      this.closeAnnouncementSheet();
    } catch (err) {
      console.error('保存公告失败', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ announcementSaving: false });
      wx.hideLoading();
    }
  },

  confirmDeleteAnnouncement() {
    const announcementId = this.data.announcementForm.announcementId;
    if (!announcementId) {
      wx.showToast({ title: '暂无公告可删除', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除公告',
      content: '确认删除当前公告？',
      success: async res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...', mask: true });
        try {
          await callProjectService('deleteAnnouncement', { announcementId });
          wx.showToast({ title: '已删除', icon: 'success' });
          await this.loadAnnouncement();
        } catch (err) {
          console.error('删除公告失败', err);
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  }
});

async function callProjectService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: PROJECT_SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}