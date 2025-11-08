const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    adminName: '',
    today: '',
    metrics: {
      pendingToday: 0,
      totalProjects: 0,
      approvalRate: 0
    },
    categoryFilters: [
      { label: '全部类别', value: '', active: true }
    ]
  },

  onLoad() {
    this.setData({
      today: this.formatDate(new Date())
    });
    this.ensureAdminName();
    this.loadOverview();
    this.loadCategories();
  },

  onShow() {
    this.loadOverview();
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadOverview(),
      this.loadCategories()
    ]).finally(() => wx.stopPullDownRefresh());
  },

  async ensureAdminName() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAdminProfile' });
      this.setData({ adminName: res.result?.name || '管理员' });
    } catch (err) {
      console.warn('获取管理员信息失败', err);
    }
  },

  async loadOverview() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      // 直接查询数据库，不依赖云函数
      const data = await this.loadOverviewDirectly();
      
      this.setData({
        metrics: {
          pendingToday: data.pendingToday || 0,
          totalProjects: data.totalProjects || 0,
          approvalRate: (data.approvalRate || 0).toFixed(1)
        }
      });
    } catch (err) {
      console.error('概览数据加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadOverviewDirectly() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
    const pendingRes = await db.collection('applications')
      .where({ status: '待审核', createTime: _.gte(today).and(_.lt(tomorrow)) })
      .count();
    const pendingToday = pendingRes.total || 0;
  
    const projectsRes = await db.collection('activities').count();
    const totalProjects = projectsRes.total || 0;
  
    const recentRes = await db.collection('applications')
      .where({ createTime: _.gte(thirtyDaysAgo) })
      .get();
    const total = recentRes.data.length;
    const approved = recentRes.data.filter(item => item.status === '已通过').length;
    const approvalRate = total > 0 ? (approved / total * 100) : 0;
  
    return { pendingToday, totalProjects, approvalRate };
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
      const list = Array.from(exists).map(text => ({
        label: text,
        value: text,
        active: false
      }));
      this.setData({
        categoryFilters: [
          { label: '全部类别', value: '', active: true },
          ...list
        ]
      });
    } catch (err) {
      console.error('加载类别失败', err);
    }
  },

  handleCategoryTap(e) {
    const value = e.currentTarget.dataset.value;
    const updated = this.data.categoryFilters.map(item => ({
      ...item,
      active: item.value === value
    }));
    this.setData({ categoryFilters: updated });
    const url = value
      ? `/pages/admin/review/review?category=${encodeURIComponent(value)}`
      : '/pages/admin/review/review';
    wx.navigateTo({ url });
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (url.startsWith('/pages/admin/review') || url.startsWith('/pages/admin/statistics')) {
      wx.navigateTo({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
});