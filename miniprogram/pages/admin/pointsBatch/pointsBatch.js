const AUTH_SERVICE = 'adminAuthService';
const STAT_SERVICE = 'adminStatisticsService';

const MAX_BATCH = 50;
const PAGE_SIZE = 100;

Page({
  data: {
    isAdmin: false,
    keyword: '',
    list: [],
    selectedMap: {},
    selectedCount: 0,
    pointsStr: '',
    remark: '',
    searching: false,
    searched: false,
    submitting: false,
    maxBatch: MAX_BATCH
  },

  async onLoad() {
    const ok = await this.ensureAdmin();
    if (ok) {
      this.setData({ isAdmin: true });
    }
  },

  async ensureAdmin() {
    if (this.data.isAdmin) return true;
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

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onPointsInput(e) {
    this.setData({ pointsStr: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  async onSearch() {
    if (!this.data.isAdmin) return;
    const keyword = (this.data.keyword || '').trim();
    this.setData({ searching: true, searched: true, selectedMap: {}, selectedCount: 0 });
    try {
      const data = await callStatisticsService('listStudents', {
        page: 1,
        pageSize: PAGE_SIZE,
        keyword,
        order: 'desc'
      });
      const list = data.list || [];
      this.setData({ list });
      if (!list.length) {
        wx.showToast({ title: '无匹配学生', icon: 'none' });
      }
    } catch (err) {
      console.error('搜索学生失败', err);
      wx.showToast({ title: err.message || '搜索失败', icon: 'none' });
      this.setData({ list: [] });
    } finally {
      this.setData({ searching: false });
    }
  },

  onToggleRow(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const selectedMap = { ...this.data.selectedMap };
    selectedMap[id] = !selectedMap[id];
    const selectedCount = Object.keys(selectedMap).filter(k => selectedMap[k]).length;
    this.setData({ selectedMap, selectedCount });
  },

  onSelectPage() {
    const selectedMap = { ...this.data.selectedMap };
    (this.data.list || []).forEach(item => {
      if (item._id) selectedMap[item._id] = true;
    });
    const selectedCount = Object.keys(selectedMap).filter(k => selectedMap[k]).length;
    this.setData({ selectedMap, selectedCount });
  },

  onClearSelection() {
    this.setData({ selectedMap: {}, selectedCount: 0 });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const ok = await this.ensureAdmin();
    if (!ok) return;

    const points = Math.floor(Number(this.data.pointsStr));
    if (!Number.isFinite(points) || points < 1 || points > 5000) {
      wx.showToast({ title: '分值须为 1～5000 的整数', icon: 'none' });
      return;
    }

    const userIds = Object.keys(this.data.selectedMap).filter(id => this.data.selectedMap[id]);
    if (!userIds.length) {
      wx.showToast({ title: '请先勾选学生', icon: 'none' });
      return;
    }
    if (userIds.length > MAX_BATCH) {
      wx.showToast({ title: `单次最多 ${MAX_BATCH} 人`, icon: 'none' });
      return;
    }

    const remark = (this.data.remark || '').trim();
    wx.showModal({
      title: '确认加分',
      content: `将为 ${userIds.length} 名学生每人增加 ${points} 分，是否继续？`,
      success: async res => {
        if (!res.confirm) return;
        this.setData({ submitting: true });
        wx.showLoading({ title: '提交中...', mask: true });
        try {
          const data = await callStatisticsService('batchAddPoints', {
            userIds,
            points,
            remark
          });
          const okCount = data.okCount || 0;
          const failCount = data.failCount || 0;
          const failures = data.failures || [];
          let content = `成功 ${okCount} 人`;
          if (failCount) {
            content += `，失败 ${failCount} 人`;
            const sample = failures
              .slice(0, 5)
              .map(f => `${f.name || f.userId || ''}: ${f.reason || ''}`)
              .join('\n');
            if (sample) content += `\n${sample}`;
            if (failures.length > 5) content += '\n…';
          }
          wx.showModal({
            title: '处理完成',
            content,
            showCancel: false,
            success: () => {
              this.setData({
                selectedMap: {},
                selectedCount: 0,
                pointsStr: '',
                remark: ''
              });
              if (this.data.searched) {
                this.onSearch();
              }
            }
          });
        } catch (err) {
          console.error('批量加分失败', err);
          wx.showToast({ title: err.message || '提交失败', icon: 'none' });
        } finally {
          wx.hideLoading();
          this.setData({ submitting: false });
        }
      }
    });
  }
});

async function callStatisticsService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: STAT_SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}
