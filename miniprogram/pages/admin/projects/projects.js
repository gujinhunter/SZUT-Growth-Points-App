const AUTH_SERVICE = 'adminAuthService';
const PROJECT_SERVICE = 'adminProjectService';

Page({
  data: {
    loading: false,
    isAdmin: false,
    categories: [],
    groupedProjects: [],
    projects: [],
    keyword: '',
    categorySheetVisible: false,
    categorySheetMode: 'list',
    categorySaving: false,
    categoryForm: {
      categoryId: '',
      name: '',
      order: 0,
      description: ''
    }
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
      const normalized = (Array.isArray(data) ? data : []).map((item, index) => {
        if (typeof item === 'string') {
          return {
            _id: '',
            name: item,
            order: index,
            projectCount: 0,
            description: ''
          };
        }
        return {
          _id: item?._id || '',
          name: item?.name || `类别${index + 1}`,
          order: typeof item?.order === 'number' ? item.order : index,
          projectCount: item?.projectCount || 0,
          description: item?.description || ''
        };
      });
      this.setData({ categories: normalized });
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '加载类别失败', icon: 'none' });
      this.setData({
        categories: [
          {
            _id: '',
            name: '其他',
            order: 0,
            projectCount: 0,
            description: ''
          }
        ]
      });
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

      const groupedProjects = [];
      const categories = (this.data.categories || []).map((cat, idx) => {
        const name = cat.name || `分类${idx + 1}`;
        const projects = grouped[name] || [];
        const updated = {
          ...cat,
          name,
          projectCount: projects.length
        };
        if (projects.length) {
          groupedProjects.push({
            category: name,
            categoryId: updated._id || '',
            order: typeof updated.order === 'number' ? updated.order : idx,
            description: updated.description || '',
            projectCount: projects.length,
            projects
          });
        }
        return updated;
      });

      Object.keys(grouped).forEach(category => {
        if (categories.find(cat => cat.name === category)) return;
        const projects = grouped[category] || [];
        const extraCat = {
          _id: '',
          name: category,
          order: Number.MAX_SAFE_INTEGER,
          description: '',
          projectCount: projects.length
        };
        categories.push(extraCat);
        groupedProjects.push({
          category,
          categoryId: '',
          order: Number.MAX_SAFE_INTEGER,
          description: '',
          projectCount: projects.length,
          projects
        });
      });

      groupedProjects.sort((a, b) => {
        const orderA = a.order ?? 0;
        const orderB = b.order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return a.category.localeCompare(b.category);
      });

      this.setData({
        groupedProjects,
        projects: data.list || [],
        categories
      });
    } catch (err) {
      console.error('加载项目失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ groupedProjects: [], projects: [] });
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

  openCategorySheet() {
    this.setData({
      categorySheetVisible: true,
      categorySheetMode: 'list'
    });
  },

  closeCategorySheet() {
    this.setData({
      categorySheetVisible: false,
      categorySheetMode: 'list',
      categorySaving: false,
      categoryForm: {
        categoryId: '',
        name: '',
        order: this.data.categories.length,
        description: ''
      }
    });
  },

  openCategoryForm(e) {
    const { id = '', name = '', order = 0, description = '' } = e.currentTarget.dataset;
    const existing = this.data.categories.find(item => item._id === id) || {};
    this.setData({
      categorySheetMode: 'form',
      categoryForm: {
        categoryId: id,
        name: existing.name || name,
        order: typeof existing.order === 'number' ? existing.order : order,
        description: existing.description || description || ''
      }
    });
  },

  openCreateCategory() {
    this.setData({
      categorySheetMode: 'form',
      categoryForm: {
        categoryId: '',
        name: '',
        order: this.data.categories.length,
        description: ''
      }
    });
  },

  onCategoryNameInput(e) {
    this.setData({
      'categoryForm.name': e.detail.value
    });
  },

  onCategoryOrderInput(e) {
    this.setData({
      'categoryForm.order': e.detail.value
    });
  },

  onCategoryDescInput(e) {
    this.setData({
      'categoryForm.description': e.detail.value
    });
  },

  async saveCategory() {
    if (this.data.categorySaving) return;
    const { categoryForm } = this.data;
    const name = (categoryForm.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入类别名称', icon: 'none' });
      return;
    }
    this.setData({ categorySaving: true });
    wx.showLoading({ title: '保存中...' });
    try {
      await callProjectService('saveCategory', {
        categoryId: categoryForm.categoryId,
        name,
        order: Number(categoryForm.order),
        description: (categoryForm.description || '').trim()
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      await this.loadCategories();
      await this.loadProjects();
      this.setData({ categorySheetMode: 'list' });
    } catch (err) {
      console.error('保存类别失败', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ categorySaving: false });
      wx.hideLoading();
    }
  },

  formatOrderDisplay(order) {
    if (order === undefined || order === null) return '--';
    return Number(order);
  },

  noop() {},

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