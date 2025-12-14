const SERVICE = 'adminRewardService';

Page({
  data: {
    loading: false,
    saving: false,
    uploading: false,
    editingId: '',
    orderOptions: [1],
    selectedSortIndex: 0,
    rewards: [],
    form: {
      name: '',
      needPoints: '',
      stock: '',
      cover: '',
      status: 'enabled',
      description: '',
      sort: 1
    },
    sheetVisible: false
  },

  onLoad() {
    this.loadRewards();
  },

  onPullDownRefresh() {
    this.loadRewards();
  },

  async loadRewards() {
    try {
      this.setData({ loading: true });
      wx.showLoading({ title: '加载中', mask: true });
      const data = await callService('listRewards', { page: 1, pageSize: 100 });
      const rewards = (data?.list || []).map(item => ({
        id: item._id,
        name: item.name,
        needPoints: item.needPoints ?? item.requiredPoints ?? item.points ?? 0,
        stock: item.stock ?? '—',
        cover: item.cover || '',
        status: item.status || 'enabled',
        description: item.description || '',
        sort: item.sort || 1
      }));
      const orderOptions = this.buildOrderOptions(rewards.length + 1);
      const selectedSortIndex = this.calcSortIndex(this.data.form.sort, orderOptions);
      this.setData({ rewards, orderOptions, selectedSortIndex });
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({
        rewards: [],
        orderOptions: [1, 2],
        selectedSortIndex: 1,
        'form.sort': 2
      });
    } finally {
      this.setData({ loading: false });
      wx.hideLoading();
      wx.stopPullDownRefresh();
    }
  },

  openSheet(e) {
    const id = e?.currentTarget?.dataset?.id || '';
    const target = this.data.rewards.find(r => r.id === id);
    if (target) {
      this.setData({
        editingId: id,
        form: {
          name: target.name,
          needPoints: target.needPoints,
          stock: target.stock === '—' ? '' : target.stock,
          cover: target.cover,
          status: target.status,
          description: target.description,
          sort: target.sort || 1
        },
        selectedSortIndex: this.calcSortIndex(target.sort || 1, this.data.orderOptions),
        sheetVisible: true
      });
    } else {
      const last = this.data.orderOptions[this.data.orderOptions.length - 1] || 1;
      this.resetForm(last);
      this.setData({
        sheetVisible: true,
        selectedSortIndex: this.data.orderOptions.length - 1,
        'form.sort': last
      });
    }
  },

  closeSheet() {
    this.setData({ sheetVisible: false, saving: false, editingId: '' });
  },

  resetForm(defaultSort = 1) {
    this.setData({
      editingId: '',
      form: {
        name: '',
        needPoints: '',
        stock: '',
        cover: '',
        status: 'enabled',
        description: '',
        sort: defaultSort
      },
      selectedSortIndex: this.calcSortIndex(defaultSort, this.data.orderOptions)
    });
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`form.${key}`]: e.detail.value });
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ 'form.status': idx === 1 ? 'disabled' : 'enabled' });
  },

  onSortChange(e) {
    const idx = Number(e.detail.value || 0);
    const value = this.data.orderOptions[idx] ?? 1;
    this.setData({ 'form.sort': value, selectedSortIndex: idx });
  },

  async saveReward() {
    if (this.data.saving) return;
    const f = this.data.form;
    const name = (f.name || '').trim();
    const needPoints = Number(f.needPoints);
    const stock = f.stock === '' ? null : Number(f.stock);
    const sort = Number(f.sort) || 1;

    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    if (!Number.isFinite(needPoints) || needPoints <= 0) {
      wx.showToast({ title: '请输入有效积分', icon: 'none' });
      return;
    }
    if (stock !== null && (!Number.isFinite(stock) || stock < 0)) {
      wx.showToast({ title: '库存需为非负数', icon: 'none' });
      return;
    }
    if (!Number.isFinite(sort) || sort < 1) {
      wx.showToast({ title: '排序需从 1 开始', icon: 'none' });
      return;
    }

    try {
      this.setData({ saving: true });
      wx.showLoading({ title: '保存中', mask: true });
      await callService('saveReward', {
        rewardId: this.data.editingId || undefined,
        name,
        needPoints,
        stock,
        cover: f.cover || '',
        status: f.status || 'enabled',
        description: f.description || '',
        sort
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      this.closeSheet();
      this.loadRewards();
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
      wx.hideLoading();
    }
  },

  confirmDelete(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.showModal({
      title: '删除奖品',
      content: '确认删除该奖品？',
      success: async res => {
        if (!res.confirm) return;
        try {
          wx.showLoading({ title: '删除中', mask: true });
          await callService('deleteReward', { rewardId: id });
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadRewards();
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  async uploadCover() {
    if (this.data.uploading) return;
    try {
      const choose = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed']
      });
      const filePath = choose.tempFilePaths?.[0];
      if (!filePath) return;
      const ext = filePath.split('.').pop() || 'jpg';
      const cloudPath = `rewards/cover_${Date.now()}.${ext}`;

      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中', mask: true });

      const res = await wx.cloud.uploadFile({ cloudPath, filePath });
      this.setData({ 'form.cover': res.fileID });
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (err) {
      if (err?.errMsg?.includes('cancel')) return;
      console.error('上传封面失败', err);
      wx.showToast({ title: err.message || '上传失败', icon: 'none' });
    } finally {
      this.setData({ uploading: false });
      wx.hideLoading();
    }
  },

  // 根据当前奖品数量生成排序选项，至少从 1 开始
  buildOrderOptions(length) {
    const len = Math.max(Number(length) || 0, 1);
    return Array.from({ length: len }, (_, i) => i + 1);
  },

  // 找到排序值在选项中的索引，找不到则 0
  calcSortIndex(value, list) {
    const idx = list.findIndex(v => Number(v) === Number(value));
    return idx >= 0 ? idx : 0;
  },

  noop() {}
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

