const db = wx.cloud.database();

Page({
  data: {
    projectId: '',
    projectName: '',
    fileID: '',
    fileName: ''
  },

  onLoad(options) {
    this.setData({
      projectId: options.projectId,
      projectName: options.projectName
    });
  },

  // 选择文件
  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: res => {
        const file = res.tempFiles[0];
        this.uploadFile(file);
      }
    });
  },

  // 上传文件到云存储
  uploadFile(file) {
    const cloudPath = `applications/${Date.now()}-${file.name}`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath: file.path,
      success: res => {
        this.setData({
          fileID: res.fileID,
          fileName: file.name
        });
        wx.showToast({ title: '上传成功', icon: 'success' });
      },
      fail: err => {
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  // 提交表单
  submitForm(e) {
    const { name, phone, reason } = e.detail.value;
    const { projectId, projectName, fileID } = this.data;

    if (!name || !phone || !reason) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    db.collection('applications').add({
      data: {
        projectId,
        projectName,
        name,
        phone,
        reason,
        fileID,
        status: '待审核',
        createTime: new Date()
      },
      success: () => {
        wx.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      },
      fail: err => {
        wx.showToast({ title: '提交失败', icon: 'none' });
        console.error(err);
      }
    });
  }
});
