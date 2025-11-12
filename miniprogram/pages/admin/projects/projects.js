const AUTH_SERVICE = 'adminAuthService';
const PROJECT_SERVICE = 'adminProjectService';

Page({
  data: {
    loading: false,
    isAdmin: false,
    categories: [],
    groupedProjects: [],
    keyword: ''
  },

  async onLoad() {
    const ok = await this.ensureAdmin();
    if (ok) {
      await this.loadCategories();
      this.loadProjects();
    }
  },

  onShow() {
    if (this.data.isAdmin) {
      this.loadProjects();
    }
  },

  async ensureAdmin() {
    try {
      const res = await wx.cloud.callFunction({
        name: AUTH_SERVICE,
        data: { action: 'ensureAdmin' }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '无管理员权限');
      }
      this.setData({ isAdmin: true });
      return true;
    } catch (err) {
      console.error('管理员校验失败', err);
      wx.showModal({
        title: '无权限',
        content: err.message || '当前帐号没有管理员权限',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return false;
    }
  },

  async loadCategories() {
    try {
      const data = await callProjectService('listCategories');
      this.setData({ categories: data });
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '加载类别失败', icon: 'none' });
      this.setData({ categories: ['其他'] });
    }
  },

  async loadProjects() {
    if (!this.data.isAdmin) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const { keyword } = this.data;
      const data = await callProjectService('listProjects', {
        page: 1,
        pageSize: 200,
        keyword: keyword.trim()
      });

      const grouped = {};
      (data.list || []).forEach(item => {
        const category = item.category || '未分类';
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push({
          ...item,
          displayScore: this.formatScore(item.score)
        });
      });

      const groupedProjects = Object.keys(grouped)
        .sort()
        .map(category => ({ category, projects: grouped[category] }));

      this.setData({ groupedProjects });
    } catch (err) {
      console.error('加载项目失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ groupedProjects: [] });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearch() {
    this.loadProjects();
  },

  addProject() {
    wx.navigateTo({ url: '/pages/admin/projectEdit/projectEdit' });
  },

  editProject(e) {
    const item = e.currentTarget.dataset.item;
    const itemStr = JSON.stringify(item);
    wx.navigateTo({
      url: `/pages/admin/projectEdit/projectEdit?item=${encodeURIComponent(itemStr)}`
    });
  },

  deleteProject(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '确认删除',
      content: '是否确认删除该项目？',
      success: async res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          await callProjectService('deleteProject', { projectId: id });
          wx.showToast({ title: '已删除' });
          this.loadProjects();
        } catch (err) {
          console.error('删除项目失败', err);
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  formatScore(score) {
    if (Array.isArray(score)) return score.join('/');
    if (typeof score === 'string') return score.replace(/,/g, '/');
    if (typeof score === 'number') return score.toString();
    return score ?? '';
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