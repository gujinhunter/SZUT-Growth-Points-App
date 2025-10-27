const db = wx.cloud.database();

Page({
  data: {
    applications: []
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
              const formatted = res.data.map(item => ({
                ...item,
                createTimeFormatted: new Date(item.createTime).toLocaleString(),
                statusClass: this.getStatusClass(item.status)
              }));
              this.setData({ applications: formatted });
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
    const fileID = e.currentTarget.dataset.fileid;
    wx.cloud.downloadFile({
      fileID,
      success: res => {
        wx.openDocument({
          filePath: res.tempFilePath
        });
      },
      fail: err => {
        wx.showToast({ title: '文件无法打开', icon: 'none' });
      }
    });
  }
});
