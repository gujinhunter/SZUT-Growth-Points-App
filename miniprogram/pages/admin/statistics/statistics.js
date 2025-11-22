// miniprogram/pages/admin/statistics/statistics.js
const AUTH_SERVICE = 'adminAuthService';
const STAT_SERVICE = 'adminStatisticsService';

const PAGE_SIZE = 100;

Page({
  data: {
    loading: true,
    exporting: false,
    isAdmin: false,
    students: [],
    lastRefresh: '',
    emptyText: '暂无学生数据'
  },

  async onLoad() {
    const ok = await this.ensureAdmin();
    if (ok) {
      this.loadStudents();
    }
  },

  onPullDownRefresh() {
    this.loadStudents().finally(() => wx.stopPullDownRefresh());
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

  async loadStudents() {
    if (!this.data.isAdmin) return;
    this.setData({ loading: true });
    try {
      let page = 1;
      let total = 0;
      let collected = [];
      do {
        const data = await callStatisticsService('listStudents', {
          page,
          pageSize: PAGE_SIZE,
          order: 'desc'
        });
        const list = data.list || [];
        total = data.total || 0;
        collected = collected.concat(list);
        if (collected.length >= total || list.length < PAGE_SIZE) {
          break;
        }
        page += 1;
      } while (true);

      collected.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

      let prevPoints = null;
      let currentRank = 0;
      const ranked = collected.map((item, index) => {
        const points = item.totalPoints || 0;
        if (prevPoints === null) {
          currentRank = 1;
        } else if (points !== prevPoints) {
          currentRank = index + 1;
        }
        prevPoints = points;
        return {
          rank: currentRank,
          name: item.name || '未填写姓名',
          studentId: item.studentId || '—',
          academy: item.academy || '',
          className: item.className || '',
          major: item.major || '',
          totalPoints: points
        };
      });

      const now = new Date();
      const lastRefresh = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now
        .getDate()
        .toString()
        .padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;

      this.setData({
        students: ranked,
        lastRefresh,
        loading: false,
        emptyText: ranked.length ? '' : '暂无学生数据'
      });
    } catch (err) {
      console.error('加载学生积分失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({
        loading: false,
        students: [],
        emptyText: '加载失败，请下拉重试'
      });
    }
  },

  async handleExport() {
    if (this.data.exporting) return;
    const ok = await this.ensureAdmin();
    if (!ok) return;
    this.setData({ exporting: true });
    try {
      wx.showLoading({ title: '生成报表...' });
      const res = await wx.cloud.callFunction({
        name: 'adminStatisticsSimpleExport',
        data: {}
      });
      const fileID = res.result?.fileID;
      if (!fileID) {
        throw new Error('empty fileID');
      }

      wx.showLoading({ title: '下载中...' });
      const downloadRes = await wx.cloud.downloadFile({ fileID });
      const tempFilePath = downloadRes.tempFilePath;

      let savedFilePath = tempFilePath;
      try {
        const saveRes = await wx.saveFile({ tempFilePath });
        savedFilePath = saveRes.savedFilePath;
      } catch (saveErr) {
        console.warn('保存报表失败，使用临时文件继续', saveErr);
      }

      wx.hideLoading();
      wx.showToast({ title: '报表已生成', icon: 'success', duration: 1200 });
      this.showExportActions(savedFilePath);
    } catch (err) {
      console.error('导出失败', err);
      wx.hideLoading();
      wx.showToast({ title: '导出失败', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  },

  showExportActions(filePath) {
    if (!filePath) return;
    wx.showActionSheet({
      itemList: ['打开预览', '分享文件'],
      success: res => {
        if (res.tapIndex === 0) {
          this.openReport(filePath);
        } else if (res.tapIndex === 1) {
          this.shareReport(filePath);
        }
      }
    });
  },

  openReport(filePath) {
    wx.openDocument({
      filePath,
      fileType: 'xlsx',
      fail: err => {
        console.error('打开报表失败', err);
        wx.showToast({ title: '无法打开文件', icon: 'none' });
      }
    });
  },

  shareReport(filePath) {
    if (!wx.canIUse('shareFileMessage')) {
      wx.showToast({ title: '当前版本不支持分享文件', icon: 'none' });
      return;
    }
    wx.shareFileMessage({
      filePath,
      fileName: '积分统计.xlsx',
      success: () => {
        wx.showToast({ title: '已发送', icon: 'success' });
      },
      fail: err => {
        console.error('分享报表失败', err);
        wx.showToast({ title: '分享失败', icon: 'none' });
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