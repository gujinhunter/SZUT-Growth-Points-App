// miniprogram/pages/admin/statistics/statistics.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,
    exporting: false,
    students: [],
    lastRefresh: '',
    emptyText: '暂无学生数据'
  },

  onLoad() {
    this.loadStudents();
  },

  onPullDownRefresh() {
    this.loadStudents().finally(() => wx.stopPullDownRefresh());
  },

  async loadStudents() {
    this.setData({ loading: true });
    try {
      const MAX_LIMIT = 100;
      const baseQuery = db.collection('users').where({ role: _.neq('admin') });
      const countRes = await baseQuery.count();
      const total = countRes.total || 0;
      const tasks = [];
      for (let i = 0; i < Math.ceil(total / MAX_LIMIT); i++) {
        tasks.push(
          baseQuery
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .field({
              name: true,
              studentId: true,
              totalPoints: true,
              className: true,
              academy: true,
              role: true
            })
            .get()
        );
      }
      const results = await Promise.all(tasks);
      const list = results.flatMap(res => res.data || []).filter(item => item.role !== 'admin');
      list.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

      let prevPoints = null;
      let currentRank = 0;
      const ranked = list.map((item, index) => {
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
          totalPoints: points
        };
      });
      const now = new Date();
      this.setData({
        students: ranked,
        lastRefresh: `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
        loading: false,
        emptyText: ranked.length ? '' : '暂无学生数据'
      });
    } catch (err) {
      console.error('加载学生积分失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({
        loading: false,
        students: [],
        emptyText: '加载失败，请下拉重试'
      });
    }
  },

  async handleExport() {
    if (this.data.exporting) return;
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