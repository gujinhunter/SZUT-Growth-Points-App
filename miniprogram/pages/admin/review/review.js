const AUTH_SERVICE = 'adminAuthService';
const REVIEW_SERVICE = 'adminReviewService';
const FILE_SERVICE = 'getFileTempUrl';

Page({
  data: {
    loading: true,
    isAdmin: false,
    applications: [],
    keyword: '',
    filters: {
      categoryIndex: 0
    },
    filterOptions: {
      categories: [{ label: '全部类别', value: '' }]
    },
    rejectDialogVisible: false,
    rejectRemark: '',
    rejectTarget: null,
    rejectSubmitting: false
  },

  async onLoad() {
    const ok = await this.ensureAdmin();
    if (!ok) return;
    await this.loadFilterOptions();
    this.loadApplications();
  },

  onPullDownRefresh() {
    this.loadApplications().finally(() => wx.stopPullDownRefresh());
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

  async loadFilterOptions() {
    try {
      const data = await callReviewService('listFilters');
      const categories = [{ label: '全部类别', value: '' }].concat(
        (data.categories || []).map(text => ({ label: text, value: text }))
      );
      this.setData({ 'filterOptions.categories': categories });
    } catch (err) {
      console.error('加载筛选项失败', err);
      wx.showToast({ title: '筛选数据加载失败', icon: 'none' });
      this.setData({ 'filterOptions.categories': [{ label: '全部类别', value: '' }] });
    }
  },

  async loadApplications() {
    if (!this.data.isAdmin) return;
    this.setData({ loading: true });
    try {
      const { keyword, filters, filterOptions } = this.data;
      const category = filterOptions.categories[filters.categoryIndex]?.value || '';
      const data = await callReviewService('listPending', {
        keyword: keyword.trim(),
        category,
        page: 1,
        pageSize: 50
      });

      const list = (data.list || []).map(item => ({
        ...item,
        createTimeFormatted: this.formatDateTime(item.createTime),
        statusClass: 'pending',
        pointsDisplay: Array.isArray(item.points)
          ? item.points.join('/')
          : (item.points === 0 ? 0 : (item.points ?? '—'))
      }));

      this.setData({ applications: list });
    } catch (err) {
      console.error('加载申请失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ applications: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearchConfirm() {
    this.loadApplications();
  },

  onSearch() {
    this.loadApplications();
  },

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadApplications();
    });
  },

  noop() {},

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/admin/reviewDetail/reviewDetail?id=${id}`
    });
  },

  previewFile(e) {
    e.stopPropagation?.();
    const fileIDs = e.currentTarget.dataset.fileids;
    const list = Array.isArray(fileIDs) ? fileIDs : (fileIDs ? [fileIDs] : []);
    if (!list.length) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: list.map((_, idx) => `附件${idx + 1}`),
      success: res => {
        const fileID = list[res.tapIndex];
        if (!fileID) return;
        this.openFile(fileID);
      }
    });
  },

  openFile(fileID) {
    if (!fileID) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开附件...' });
    wx.cloud.callFunction({
      name: FILE_SERVICE,
      data: { fileIDs: [fileID] }
    }).then(async res => {
      const fileList = res.result?.data;
      const info = Array.isArray(fileList) ? fileList[0] : null;
      const tempUrl = info?.tempFileURL;
      if (!tempUrl) {
        throw new Error(info?.errMsg || 'empty temp url');
      }

      const lower = (fileID || '').toLowerCase();
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const isImage = imageExts.some(ext => lower.includes(ext));

      if (isImage) {
        wx.hideLoading();
        wx.previewImage({ urls: [tempUrl], current: tempUrl });
        return;
      }

      const downloadRes = await wx.downloadFile({ url: tempUrl });
      wx.hideLoading();
      if (downloadRes.statusCode !== 200) {
        throw new Error(`download fail: ${downloadRes.statusCode}`);
      }
      wx.openDocument({
        filePath: downloadRes.tempFilePath,
        fail: err => {
          console.error('打开附件失败', err);
          wx.showToast({ title: '无法打开文件', icon: 'none' });
        }
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('附件打开失败', err);
      wx.showToast({ title: '打开失败', icon: 'none' });
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
  },

  async handleApprove(e) {
    e.stopPropagation?.();
    const appId = e.currentTarget.dataset.id;
    if (!appId) return;

    wx.showModal({
      title: '确认通过',
      content: '确认将该申请设置为"已通过"并发放积分吗？',
      success: async res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await callReviewService('approveApplication', { applicationId: appId });
          wx.showToast({ title: '已通过并发放积分', icon: 'success' });
          this.loadApplications();
        } catch (err) {
          console.error('审批通过失败', err);
          wx.showToast({ title: err.message || '处理失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  handleReject(e) {
    e.stopPropagation?.();
    const appId = e.currentTarget.dataset.id;
    if (!appId) return;

    const target = this.data.applications.find(item => item._id === appId) || null;
    this.setData({
      rejectDialogVisible: true,
      rejectRemark: '',
      rejectTarget: target ? { ...target } : { _id: appId }
    });
  },

  closeRejectDialog() {
    this.setData({
      rejectDialogVisible: false,
      rejectRemark: '',
      rejectTarget: null
    });
  },

  onRejectInput(e) {
    this.setData({ rejectRemark: e.detail.value || '' });
  },

  async confirmReject() {
    if (this.data.rejectSubmitting) return;
    const remark = (this.data.rejectRemark || '').trim();
    const target = this.data.rejectTarget;
    const appId = target?._id;
    if (!appId) {
      this.closeRejectDialog();
      return;
    }
    if (!remark) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' });
      return;
    }

    this.setData({ rejectSubmitting: true });
    wx.showLoading({ title: '处理中...' });
    try {
      await callReviewService('rejectApplication', { applicationId: appId, remark });
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.closeRejectDialog();
      this.loadApplications();
    } catch (err) {
      console.error('驳回失败', err);
      wx.showToast({ title: err.message || '驳回失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ rejectSubmitting: false });
    }
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