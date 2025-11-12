// miniprogram/pages/admin/reviewHistory/reviewHistory.js
const AUTH_SERVICE = 'adminAuthService';
const REVIEW_SERVICE = 'adminReviewService';

Page({
  data: {
    loading: true,
    keyword: '',
    filters: {
      categoryIndex: 0,
      statusIndex: 0
    },
    filterOptions: {
      categories: [{ label: '全部类别', value: '' }],
      statuses: [
        { label: '全部状态', value: '' },
        { label: '已通过', value: '已通过' },
        { label: '已驳回', value: '已驳回' }
      ]
    },
    logs: [],
    emptyText: '暂无审核记录'
  },

  keywordTimer: null,

  async onLoad() {
    const ok = await this.ensureAdmin();
    if (!ok) return;
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = null;
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

  async refresh() {
    await Promise.all([this.loadFilters(true), this.loadLogs({ skipLoading: false })]);
  },

  async loadFilters(skipReload = false) {
    try {
      const data = await callReviewService('listFilters');
      const categories = [{ label: '全部类别', value: '' }].concat(
        (data.categories || []).map(text => ({ label: text, value: text }))
      );
      const statuses = [{ label: '全部状态', value: '' }].concat(
        (data.statuses || []).map(text => ({ label: text, value: text }))
      );
      this.setData({ filterOptions: { categories, statuses } });
      if (!skipReload) await this.loadLogs({ skipLoading: true });
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '类别加载失败', icon: 'none' });
    }
  },

  async loadLogs({ skipLoading = false } = {}) {
    if (!skipLoading) this.setData({ loading: true });
    try {
      const { filters, filterOptions, keyword } = this.data;
      const category = filterOptions.categories[filters.categoryIndex]?.value || '';
      const status = filterOptions.statuses[filters.statusIndex]?.value || '';

      const data = await callReviewService('listHistory', {
        keyword: keyword.trim(),
        category,
        status,
        page: 1,
        pageSize: 100
      });

      const logs = (data.list || []).map(item => ({
        ...item,
        createTimeFormatted: item.createTimeFormatted || this.formatDateTime(item.createTime),
        applicationTimeFormatted: item.applicationTimeFormatted || this.formatDateTime(item.applicationTime)
      }));

      this.setData({
        logs,
        emptyText: logs.length ? '' : '暂无审核记录',
        loading: false
      });
    } catch (err) {
      console.error('加载审核日志失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({
        loading: false,
        logs: [],
        emptyText: '加载失败，请下拉重试'
      });
    }
  },

  onKeywordInput(e) {
    const value = e.detail.value || '';
    this.setData({ keyword: value });
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
    }
    this.keywordTimer = setTimeout(() => {
      this.loadLogs({ skipLoading: false });
    }, 400);
  },

  onKeywordClear() {
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = null;
    }
    this.setData({ keyword: '' }, () => {
      this.loadLogs({ skipLoading: false });
    });
  },

  onSearch() {
    this.loadLogs({ skipLoading: false });
  },

  onSearchConfirm() {
    this.loadLogs({ skipLoading: false });
  },

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadLogs({ skipLoading: false });
    });
  },

  onStatusChange(e) {
    this.setData({ 'filters.statusIndex': Number(e.detail.value) || 0 }, () => {
      this.loadLogs({ skipLoading: false });
    });
  },

  formatDateTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mi = `${date.getMinutes()}`.padStart(2, '0');
    const ss = `${date.getSeconds()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }
});

async function callReviewService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: REVIEW_SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}