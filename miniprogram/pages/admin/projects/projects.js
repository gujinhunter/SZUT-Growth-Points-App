const db = wx.cloud.database();

Page({
  data: {
    projects: [],
    groupedProjects: [],
    categories: []
  },

  async onLoad() {
    await this.loadCategories();
    this.loadProjects();
  },

  onShow() {
    this.loadProjects();
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
      this.setData({ categories });
    } catch (err) {
      console.error('加载类别失败', err);
      this.setData({ categories: ['其他'] });
    }
  },

  async loadProjects() {
    wx.showLoading({ title: '加载中...' });
    try {
      const MAX_LIMIT = 20;
      let allProjects = [];
      let hasMore = true;
      let skip = 0;

      while (hasMore) {
        const res = await db.collection('activities')
          .skip(skip)
          .limit(MAX_LIMIT)
          .orderBy('category', 'asc')
          .orderBy('createTime', 'desc')
          .get();

      allProjects = allProjects.concat(res.data);
        skip += res.data.length;
        hasMore = res.data.length === MAX_LIMIT;
      }

      // 按类别分组
      const grouped = {};
      allProjects.forEach(project => {
      project.displayScore = this.formatScore(project.score);
        const category = project.category || '未分类';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(project);
      });

      // 转换为数组格式，按类别名排序
      const groupedProjects = Object.keys(grouped)
        .sort()
        .map(category => ({
          category,
          projects: grouped[category]
        }));

      this.setData({ 
        projects: allProjects,
        groupedProjects: groupedProjects
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      console.error('加载项目失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  addProject() {
    wx.navigateTo({
      url: '/pages/admin/projectEdit/projectEdit'
    });
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
    wx.showModal({
      title: '确认删除',
      content: '是否确认删除该项目？',
      success: res => {
        if (res.confirm) {
          db.collection('activities').doc(id).remove().then(() => {
            wx.showToast({ title: '已删除' });
            this.loadProjects();
          }).catch(err => {
            wx.showToast({ title: '删除失败', icon: 'none' });
            console.error(err);
          });
        }
      }
    });
  },

  formatScore(score) {
    if (Array.isArray(score)) return score.join('/');
    if (typeof score === 'string') return score.replace(/,/g, '/');
    return score ?? '';
  }
});