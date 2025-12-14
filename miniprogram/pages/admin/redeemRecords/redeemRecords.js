const SERVICE = 'adminRewardService';

Page({
  data: {
    loading: false,
    updating: false,
    records: [],
    page: 1,
    pageSize: 50,
    hasMore: true,
    statusOptions: [
      { label: '全部', value: '' },
      { label: '未发放', value: 'unissued' },
      { label: '已发放', value: 'issued' }
    ],
    statusIndex: 0
  },

  onLoad() {
    this.loadRecords(true);
  },

  onPullDownRefresh() {
    this.loadRecords(true);
  },

  onReachBottom() {
    if (this.data.loading || !this.data.hasMore) return;
    this.loadRecords(false);
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ statusIndex: idx }, () => {
      this.loadRecords(true);
    });
  },

  async loadRecords(reset = false) {
    if (this.data.loading) return;
    const nextPage = reset ? 1 : this.data.page + 1;
    try {
      this.setData({ loading: true });
      wx.showNavigationBarLoading();
      const status = this.data.statusOptions[this.data.statusIndex]?.value || '';
      const res = await callService('listRedeemRecords', {
        page: nextPage,
        pageSize: this.data.pageSize,
        status
      });
      const statusMap = {
        issued: '已发放',
        unissued: '未发放'
      };
      const statusClassMap = {
        issued: 'ok',
        unissued: 'pending'
      };
      const list = (res?.list || []).map(item => {
        const st = item.status || 'unissued';
        const displayUser = item.userName && item.studentId
          ? `${item.userName} ${item.studentId}`
          : (item.userName || item.studentId || item.openid || '');
        return {
          id: item._id,
          rewardName: item.rewardName || '—',
          needPoints: item.needPoints ?? '—',
          status: st,
          statusText: statusMap[st] || '未发放',
          statusClass: statusClassMap[st] || 'pending',
          createdAt: this.formatDateTime(item.createdAt),
          cover: item.cover || '',
          openid: item.openid || '',
          userName: item.userName || '',
          studentId: item.studentId || '',
          displayUser,
          userConsumedPoints: item.userConsumedPoints ?? null
        };
      });
      const merged = reset ? list : [...this.data.records, ...list];
      this.setData({
        records: merged,
        page: nextPage,
        hasMore: merged.length < (res?.total || 0)
      });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }
  },

  formatDateTime(input) {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';
    const pad = n => `${n}`.padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  async markIssued(e) {
    if (this.data.updating) return;
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    try {
      this.setData({ updating: true });
      wx.showLoading({ title: '更新中', mask: true });
      await callService('updateRedeemStatus', { recordId: id, status: 'issued' });
      wx.showToast({ title: '已标记发放', icon: 'success' });
      this.loadRecords(true);
    } catch (err) {
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    } finally {
      this.setData({ updating: false });
      wx.hideLoading();
    }
  }
});

async function callService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}

