const SERVICE = 'studentPointsService';

Page({
  data: {
    loading: false,
    records: [],
    page: 1,
    pageSize: 30,
    hasMore: true
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

  async loadRecords(reset = false) {
    const nextPage = reset ? 1 : this.data.page + 1;
    try {
      this.setData({ loading: true });
      const res = await callService('listMyRedeemRecords', {
        page: nextPage,
        pageSize: this.data.pageSize
      });
      const statusTextMap = {
        unissued: '未发放',
        issued: '已发放',
        success: '已完成',
        failed: '失败'
      };
      const statusClassMap = {
        unissued: 'pending',
        issued: 'success',
        success: 'success',
        failed: 'failed'
      };
      const list = (res?.list || []).map(item => ({
        id: item._id || item.id,
        rewardName: item.rewardName || '—',
        needPoints: item.needPoints ?? '—',
        cover: item.cover || '',
        status: item.status || 'unissued',
        statusText: statusTextMap[item.status] || '未发放',
        statusClass: statusClassMap[item.status] || 'pending',
        date: formatDate(item.createdAt)
      }));
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
      wx.stopPullDownRefresh();
    }
  }
});

function formatDate(input) {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

