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
    }
  },

  onLoad() {
    this.setData({
      today: this.formatDate(new Date())
    });
    this.ensureAdminName();
    this.loadOverview();
  },

  onShow() {
    this.loadOverview();
  },

  onPullDownRefresh() {
    this.loadOverview().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAdminName() {
    try {
      const openRes = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openid = openRes.result?.openid;
      if (!openid) throw new Error('missing openid');

      const userRes = await db.collection('users')
        .where({ _openid: openid })
        .field({ name: true, role: true })
        .get();

      const user = (userRes.data || []).find(item => item.role === 'admin') || userRes.data?.[0];
      this.setData({ adminName: user?.name || '管理员' });
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
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
    const pendingRes = await db.collection('applications')
      .where({ status: '待审核' })
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