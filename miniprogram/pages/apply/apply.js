const db = wx.cloud.database();

Page({
  data: {
    projectId: '',
    projectName: '',
    fileID: '',
    fileName: '',
    currentOpenId: ''
  },

  async onLoad(options) {
    this.setData({
      projectId: options.projectId,
      projectName: options.projectName
    });

    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      this.setData({ currentOpenId: res.result.openid });
    } catch (err) {
      console.error('获取 openid 失败', err);
      wx.showToast({ title: '无法获取身份信息', icon: 'none' });
    }
  },

  // 选择文件
  chooseFile() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const file = res.tempFiles[0];
        const cloudPath = `applications/${Date.now()}.jpg`;
        this.uploadFile(cloudPath, file.path);
      },
      fail: err => {
        console.error('选择图片失败', err);
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    });
  },

  // 上传文件到云存储
  uploadFile(cloudPath, filePath) {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: res => {
        this.setData({
          fileID: res.fileID,
          fileName: cloudPath.split('/').pop()
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
    const { projectId, projectName, fileID, currentOpenId } = this.data;

    if (!name || !phone || !reason) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    if (!currentOpenId) {
      wx.showToast({ title: '身份信息缺失，请重试', icon: 'none' });
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
        studentOpenId: currentOpenId,
        points: 0,
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
