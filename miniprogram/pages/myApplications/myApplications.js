const db = wx.cloud.database();

Page({
  data: {
    applications: [],
    applicationGroups: []
  },

  onShow() {
    this.loadApplications();
  },

  // 加载当前用户申请记录
  loadApplications() {
    wx.cloud.callFunction({
      name: 'getOpenId',
      success: res => {
        const openid = res.result.openid;
        db.collection('applications')
          .where({ _openid: openid })
          .orderBy('createTime', 'desc')
          .get({
            success: res => {
              const formatted = res.data.map(item => {
                const fileIDs = Array.isArray(item.fileIDs)
                  ? item.fileIDs
                  : item.fileID
                    ? [item.fileID]
                    : [];
                const fileNames = Array.isArray(item.fileNames) && item.fileNames.length
                  ? item.fileNames
                  : fileIDs.map((_, idx) => `附件${idx + 1}`);
                return {
                  ...item,
                  fileIDs,
                  fileNames,
                  createTimeFormatted: new Date(item.createTime).toLocaleString(),
                  statusClass: this.getStatusClass(item.status)
                };
              });

              const groupConfig = [
                { status: '待审核', key: 'pending', label: '待审核' },
                { status: '已通过', key: 'approved', label: '已通过' },
                { status: '已驳回', key: 'rejected', label: '已驳回' }
              ];
            
              const grouped = groupConfig.map(cfg => ({
                status: cfg.status,
                label: cfg.label,
                list: formatted.filter(item => item.status === cfg.status)
              })).filter(group => group.list.length > 0);

              this.setData({
                applications: formatted,
                applicationGroups: grouped
              });
            }
          });
      }
    });
  },

  // 根据状态返回样式类名
  getStatusClass(status) {
    if (status === '已通过') return 'approved';
    if (status === '已驳回') return 'rejected';
    return 'pending';
  },

  // 查看上传文件
  previewFile(e) {
    const appIndex = Number(e.currentTarget.dataset.appindex);
    const fileIndex = Number(e.currentTarget.dataset.fileindex);
    const app = this.data.applications?.[appIndex];
    const fileIDs = app?.fileIDs || [];
    const fileID = e.currentTarget.dataset.fileid || fileIDs[fileIndex] || fileIDs[0];
    if (!fileID) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开附件...' });
    wx.cloud.downloadFile({
      fileID,
      success: res => {
        wx.hideLoading();
        const lower = (fileID || '').toLowerCase();
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const isImage = imageExts.some(ext => lower.includes(ext));
        if (isImage) {
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          });
        } else {
          wx.openDocument({
            filePath: res.tempFilePath
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('附件下载失败', err);
        wx.showToast({ title: '文件无法打开', icon: 'none' });
      }
    });
  }
});
