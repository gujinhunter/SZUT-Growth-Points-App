const POINTS_SERVICE = 'studentPointsService';

Page({
  data: {
    loading: true,
    redeemingId: '',
    totalPoints: 0,
    redeemablePoints: 0,
    rewards: []
  },

  onLoad() {
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData();
  },

  async loadData() {
    try {
      this.setData({ loading: true });
      wx.showLoading({ title: '加载中...' });

      const [summary, rewardsRes] = await Promise.all([
        callPointsService('getSummary'),
        callPointsService('listRewards', { page: 1, pageSize: 100 })
      ]);

      const redeemablePoints = summary?.redeemablePoints
        ?? summary?.totalPoints
        ?? 0;

      let rewards = (rewardsRes?.list || []).map(item => {
        const needPoints = Number(item.needPoints ?? item.points ?? 0);
        const stock = item.stock ?? '—';
        const disabled = !Number.isFinite(needPoints)
          || needPoints <= 0
          || needPoints > redeemablePoints
          || (stock !== '—' && stock !== null && stock <= 0);

        return {
          id: item.id,
          name: item.name,
          needPoints: needPoints || '—',
          stock,
          description: item.description || '',
          cover: item.cover || '',
          disabled
        };
      });

      // 处理云文件 fileID，转换为临时访问 URL，避免图片不显示
      rewards = await this.resolveCovers(rewards);

      this.setData({
        totalPoints: summary?.totalPoints || 0,
        redeemablePoints,
        rewards
      });
    } catch (err) {
      console.error('加载兑换列表失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ rewards: [], totalPoints: 0, redeemablePoints: 0 });
    } finally {
      wx.hideLoading();
      this.setData({ loading: false, redeemingId: '' });
      wx.stopPullDownRefresh();
    }
  },

  async resolveCovers(list) {
    const fileIds = list
      .map(i => i.cover)
      .filter(v => v && typeof v === 'string' && v.startsWith('cloud://'));
    if (!fileIds.length) return list;
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: fileIds });
      const map = (res?.fileList || []).reduce((acc, cur) => {
        if (cur.fileID && cur.tempFileURL) acc[cur.fileID] = cur.tempFileURL;
        return acc;
      }, {});
      return list.map(item => ({
        ...item,
        cover: map[item.cover] || item.cover
      }));
    } catch (e) {
      console.warn('封面临时链接获取失败', e);
      return list;
    }
  },

  async onRedeemTap(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    const target = this.data.rewards.find(r => r.id === id);
    if (!target || target.disabled) {
      wx.showToast({ title: '当前不可兑换', icon: 'none' });
      return;
    }

    const confirm = await wx.showModal({
      title: '确认兑换',
      content: `消耗 ${target.needPoints} 分兑换「${target.name}」？`
    });
    if (!confirm?.confirm) return;

    try {
      this.setData({ redeemingId: id });
      wx.showLoading({ title: '兑换中...' });
      await callPointsService('redeemReward', { rewardId: id });
      wx.showToast({ title: '兑换成功', icon: 'success' });
      this.loadData();
    } catch (err) {
      console.error('兑换失败', err);
      wx.showToast({ title: err.message || '兑换失败', icon: 'none' });
      this.setData({ redeemingId: '' });
    } finally {
      wx.hideLoading();
    }
  }
});

async function callPointsService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: POINTS_SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}

