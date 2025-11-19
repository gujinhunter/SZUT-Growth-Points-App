const AUTH_SERVICE = 'adminAuthService';
const PROJECT_SERVICE = 'adminProjectService';

Page({
  data: {
    projectId: '',
    isEdit: false,
    loading: false,
    categoryOptions: ['其他'],
    formData: {
      name: '',
      categoryIndex: 0,
      scoreText: '0',
      remark: ''
    }
  },

  async onLoad(options) {
    const ok = await this.ensureAdmin();
    if (!ok) {
      return;
    }

    await this.loadCategories();

    if (options.item) {
      const item = JSON.parse(decodeURIComponent(options.item));
      this.setData({
        projectId: item._id,
        isEdit: true,
        'formData.name': item.name || '',
        'formData.scoreText': Array.isArray(item.score)
          ? item.score.join('/')
          : String(item.score || '0'),
        'formData.remark': item.remark || '',
        'formData.categoryIndex': this.getCategoryIndex(item.category)
      });
      wx.setNavigationBarTitle({ title: '编辑项目' });
    } else {
      wx.setNavigationBarTitle({ title: '添加项目' });
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
        throw new Error(result.message || '无权限');
      }
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
      const names = Array.isArray(data)
        ? data
            .map(item => (typeof item === 'string' ? item : item?.name))
            .filter(Boolean)
        : [];
      this.setData({
        categoryOptions: names.length ? names : ['其他']
      });
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '加载类别失败', icon: 'none' });
      this.setData({ categoryOptions: ['其他'] });
    }
  },

  getCategoryIndex(category) {
    const index = this.data.categoryOptions.indexOf(category || '其他');
    return index >= 0 ? index : 0;
  },

  onNameInput(e) {
    this.setData({ 'formData.name': e.detail.value });
  },

  onCategoryChange(e) {
    this.setData({ 'formData.categoryIndex': Number(e.detail.value) || 0 });
  },

  onScoreInput(e) {
    this.setData({ 'formData.scoreText': e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ 'formData.remark': e.detail.value });
  },

  parseScore(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return null;
    const parts = trimmed.split(/[,/]/).map(s => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) {
      const num = Number(parts[0]);
      return Number.isFinite(num) && num > 0 ? num : null;
    }
    const nums = parts
      .map(s => Number(s))
      .filter(num => Number.isFinite(num) && num > 0);
    return nums.length ? nums : null;
  },

  async saveProject() {
    if (this.data.loading) return;

    const { formData, categoryOptions, projectId, isEdit } = this.data;

    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' });
      return;
    }

    const score = this.parseScore(formData.scoreText);
    if (score === null || score === 0 || (Array.isArray(score) && score.length === 0)) {
      wx.showToast({ title: '请输入有效的积分值（必须大于0）', icon: 'none' });
      return;
    }

    const category = categoryOptions[formData.categoryIndex] || '其他';

    this.setData({ loading: true });
    wx.showLoading({ title: '保存中...' });

    try {
      await callProjectService('saveProject', {
        projectId: isEdit ? projectId : '',
        name: formData.name.trim(),
        category,
        score,
        remark: formData.remark.trim()
      });
      wx.showToast({ title: isEdit ? '修改成功' : '添加成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      console.error('保存项目失败', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false });
    }
  },

  goBack() {
    wx.navigateBack();
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