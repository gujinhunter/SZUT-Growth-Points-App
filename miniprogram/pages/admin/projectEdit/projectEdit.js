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

  async loadCategories() {
    try {
      const MAX_LIMIT = 20;
      // 先获取总数
      const countRes = await db.collection('activities').count();
      const total = countRes.total || 0;
      
      if (total === 0) {
        this.setData({ categoryOptions: ['其他'] });
        return;
      }
      
      // 计算需要分几次查询
      const batchTimes = Math.ceil(total / MAX_LIMIT);
      
      // 并行发起所有查询
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        tasks.push(
          db.collection('activities')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .field({ category: true })
            .get()
        );
      }
      
      // 等待所有查询完成
      const results = await Promise.all(tasks);
      
      // 合并所有结果并去重
      const allData = results.reduce((acc, cur) => acc.concat(cur.data), []);
      const exists = new Set();
      allData.forEach(item => {
        if (item && item.category) {
          exists.add(item.category);
        }
      });
      
      // 转换为数组并排序
      const categories = Array.from(exists).sort();
      if (categories.length === 0) {
        categories.push('其他');
      }
      
      this.setData({ categoryOptions: categories });
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '加载类别失败', icon: 'none' });
      // 失败时使用默认值
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
    if (!trimmed) return null; // 返回 null 表示无效
    const parts = trimmed.split(/[,/]/).map(s => s.trim()).filter(s => s);
    if (parts.length === 0) return null; // 返回 null 表示无效
    if (parts.length === 1) {
      const num = Number(parts[0]);
      return isNaN(num) || num <= 0 ? null : num; // 必须大于 0
    }
    const nums = parts.map(s => {
      const num = Number(s);
      return isNaN(num) || num <= 0 ? null : num; // 无效值设为 null
    }).filter(n => n !== null); // 过滤掉无效值
    return nums.length === 0 ? null : nums; // 至少需要一个有效值
  },
  
  async saveProject() {
    const { formData, categoryOptions, projectId, isEdit } = this.data;
    
    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入项目名称', icon: 'none' });
      return;
    }
  
    // 验证积分
    const score = this.parseScore(formData.scoreText);
    if (score === null || score === 0 || (Array.isArray(score) && score.length === 0)) {
      wx.showToast({ title: '请输入有效的积分值（必须大于0）', icon: 'none' });
      return;
    }
  
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