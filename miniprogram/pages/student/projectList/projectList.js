// pages/projectList/projectList.js
const PROJECT_SERVICE = 'studentProjectService';
const DEFAULT_ICON = '../../../assets/projects/project_active.png';
const DEFAULT_NOTICE_ICON = '../../../assets/projects/project_notice.png';
const CATEGORY_ICONS = {
  '其他': '../../../assets/projects/project_active.png',
  '创新创业': '../../../assets/projects/创新创业.png',
  '宿舍安全': '../../../assets/projects/宿舍安全.png',
  '心理健康': '../../../assets/projects/心理健康.png',
  '志愿服务': '../../../assets/projects/志愿服务.png',
  '招生就业': '../../../assets/projects/招生就业.png',
  '文体工作': '../../../assets/projects/文体工作.png',
  '苏乡永助': '../../../assets/projects/苏乡永助.png',
  '资助宣传大使': '../../../assets/projects/资助宣传大使.png'
};
const CARD_GRADIENTS = [
  ['#eef6ff', '#f4fbff'],
  ['#fef6ec', '#fff8ef'],
  ['#eefcf6', '#f5fffb'],
  ['#f4f0ff', '#f8f5ff'],
  ['#fff0f3', '#fff5f6'],
  ['#e9f7ff', '#f5fbff']
];

Page({
  data: {
    activities: [],
    loading: true,
    categoryCards: [],
    activeCategory: '',
    activeCategoryItems: [],
    defaultIcon: DEFAULT_ICON,
    showDrawer: false,
    activeCategoryDescription: '',
    announcement: null,
    defaultNoticeIcon: DEFAULT_NOTICE_ICON
  },

  onLoad() {
    this.loadActivities();
  },

  onPullDownRefresh() {
    this.loadActivities()
      .catch(() => {})
      .finally(() => wx.stopPullDownRefresh());
  },

  async loadActivities() {
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: PROJECT_SERVICE,
        data: { action: 'listProjects', payload: { page: 1, pageSize: 200 } }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '项目加载失败');
      }
    const list = result.data?.list || [];
    const announcement = this.normalizeAnnouncement(result.data?.announcement || null);
      this.setData({ activities: list, loading: false, announcement });
      this.decorateCategories(list);
    } catch (err) {
      console.error('加载项目失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ activities: [], categoryCards: [], activeCategory: '', activeCategoryItems: [], loading: false });
    } finally {
      wx.hideLoading();
    }
  },

  decorateCategories(list = []) {
    const normalized = list.map((group, index) => {
      const items = Array.isArray(group.items) ? group.items : [];
      const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
      return {
        category: group.category || `分类${index + 1}`,
        icon: group.icon || CATEGORY_ICONS[group.category] || DEFAULT_ICON,
        bgStart: gradient[0],
        bgEnd: gradient[1],
        itemCount: items.length,
        summary: this.buildSummary(items, group.description),
        description: group.description || '',
        order: typeof group.order === 'number' ? group.order : index,
        items
      };
    });

    const sorted = normalized.slice().sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.category.localeCompare(b.category);
    });

    this.setData({
      categoryCards: sorted
    });
  },

  buildSummary(items = [], description = '') {
    if (description) {
      return description.length > 24 ? `${description.slice(0, 24)}...` : description;
    }
    if (!items.length) return '暂无可申请项目';
    const first = items[0];
    if (first.remark) {
      return first.remark.length > 24 ? `${first.remark.slice(0, 24)}...` : first.remark;
    }
    if (first.displayScore) {
      return `积分参考：${first.displayScore} 分`;
    }
    return '点击查看项目详情';
  },

  selectCategory(e) {
    const { category } = e.currentTarget.dataset;
    if (!category) return;
    const target = this.data.categoryCards.find(item => item.category === category);
    this.setData({
      activeCategory: category,
      activeCategoryItems: target?.items || [],
      activeCategoryDescription: target?.description || '',
      showDrawer: true
    });
  },

  closeDrawer() {
    this.setData({ showDrawer: false });
  },

  noop() {},

  goToApply(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: `/pages/student/apply/apply?projectId=${item._id}&projectName=${item.name}`
    });
  },

  normalizeAnnouncement(raw) {
    if (!raw) return null;
    return {
      icon: raw.icon || '',
      title: raw.title || '活动公告',
      content: raw.content || '',
      expireTimeText: raw.expireTime ? this.formatDate(raw.expireTime) : '',
      publishTimeText: this.formatDateTime(raw.publishTime || raw.updatedAt)
    };
  },

  formatDateTime(input) {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    const pad = n => `${n}`.padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  formatDate(input) {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    const pad = n => `${n}`.padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
});
