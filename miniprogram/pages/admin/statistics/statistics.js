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
      const countRes = await db.collection('users').count();
      const total = countRes.total || 0;
      const tasks = [];
      for (let i = 0; i < Math.ceil(total / MAX_LIMIT); i++) {
        tasks.push(
          db.collection('users')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .field({
              name: true,
              studentId: true,
              totalPoints: true,
              className: true,
              academy: true
            })
            .get()
        );
      }
      const results = await Promise.all(tasks);
      const list = results.flatMap(res => res.data || []);
      list.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
      const ranked = list.map((item, index) => ({
        rank: index + 1,
        name: item.name || '未填写姓名',
        studentId: item.studentId || '—',
        academy: item.academy || '',
        className: item.className || '',
        totalPoints: item.totalPoints || 0
      }));
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
      wx.hideLoading();
      const fileID = res.result?.fileID;
      if (!fileID) {
        wx.showToast({ title: '导出失败', icon: 'none' });
        return;
      }
      wx.showModal({
        title: '导出成功',
        content: '是否立即下载报表？',
        confirmText: '下载',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.cloud.downloadFile({ fileID })
              .then(downloadRes => {
                wx.openDocument({
                  filePath: downloadRes.tempFilePath,
                  fileType: 'xlsx'
                });
              })
              .catch(err => {
                console.error('下载报表失败', err);
                wx.showToast({ title: '下载失败', icon: 'none' });
              });
          }
        }
      });
    } catch (err) {
      console.error('导出失败', err);
      wx.hideLoading();
      wx.showToast({ title: '导出失败', icon: 'none' });
    } finally {
      this.setData({ exporting: false });
    }
  }
});