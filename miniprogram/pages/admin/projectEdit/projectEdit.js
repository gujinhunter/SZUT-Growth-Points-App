const db = wx.cloud.database();

Page({
  data: {
    projectId: '',
    isEdit: false,
    categoryOptions: ['其他'],
    formData: {
      name: '',
      categoryIndex: 0,
      scoreText: '0',
      remark: ''
    }
  },

  async onLoad(options) {
    await this.loadCategories();
    
    if (options.item) {
      const item = JSON.parse(decodeURIComponent(options.item));
      this.setData({
        projectId: item._id,
        isEdit: true,
        'formData.name': item.name || '',
        'formData.scoreText': Array.isArray(item.score) 
          ? item.score.join(',') 
          : String(item.score || '0'),
        'formData.remark': item.remark || '',
        'formData.categoryIndex': this.getCategoryIndex(item.category)
      });
      wx.setNavigationBarTitle({ title: '编辑项目' });
    } else {
      wx.setNavigationBarTitle({ title: '添加项目' });
    }
  },

  async loadCategories() {
    try {
      const res = await db.collection('activities')
        .field({ category: true })
        .get();
      const exists = new Set();
      res.data.forEach(item => {
        if (item.category) exists.add(item.category);
      });
      const categories = Array.from(exists);
      if (categories.length === 0) {
        categories.push('其他');
      }
      this.setData({ categoryOptions: categories });
    } catch (err) {
      console.error('加载类别失败', err);
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
    if (!trimmed) return 0;
    const parts = trimmed.split(',').map(s => s.trim()).filter(s => s);
    if (parts.length === 0) return 0;
    if (parts.length === 1) {
      const num = Number(parts[0]);
      return isNaN(num) ? 0 : num;
    }
    return parts.map(s => {
      const num = Number(s);
      return isNaN(num) ? 0 : num;
    });
  },

  async saveProject() {
    const { formData, categoryOptions, projectId, isEdit } = this.data;
    
    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' });
      return;
    }

    const score = this.parseScore(formData.scoreText);
    const category = categoryOptions[formData.categoryIndex] || '其他';

    wx.showLoading({ title: '保存中...' });

    try {
      const data = {
        name: formData.name.trim(),
        category,
        score,
        remark: formData.remark.trim()
      };

      if (isEdit) {
        await db.collection('activities').doc(projectId).update({ data });
        wx.showToast({ title: '修改成功', icon: 'success' });
      } else {
        data.createTime = new Date();
        await db.collection('activities').add({ data });
        wx.showToast({ title: '添加成功', icon: 'success' });
      }

      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('保存失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});