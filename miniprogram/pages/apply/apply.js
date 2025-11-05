const db = wx.cloud.database();

Page({
  data: {
    projectId: '',
    projectName: '',
    fileID: '',
    fileName: '',
    currentOpenId: '',
    scoreOptions: [],
    selectedScoreIndex: 0,
    selectedScore: null
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

    // 加载项目的积分选项
    if (options.projectId) {
      await this.loadScoreOptions(options.projectId);
    }
  },

  async loadScoreOptions(projectId) {
    try {
      const res = await db.collection('activities').doc(projectId).get();
      const score = res.data?.score;
      if (Array.isArray(score) && score.length > 0) {
        this.setData({
          scoreOptions: score.map(s => String(s)),
          selectedScore: score[0]
        });
      } else if (typeof score === 'number') {
        this.setData({
          scoreOptions: [String(score)],
          selectedScore: score
        });
      }
    } catch (err) {
      console.error('加载积分选项失败', err);
    }
  },

  onScoreChange(e) {
    const index = Number(e.detail.value);
    const score = this.data.scoreOptions[index];
    this.setData({
      selectedScoreIndex: index,
      selectedScore: Number(score)
    });
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
  async submitForm(e) {
    const { name, phone, reason } = e.detail.value;
    const { projectId, projectName, fileID, currentOpenId, selectedScore } = this.data;

    if (!name || !phone || !reason) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    if (!currentOpenId) {
      wx.showToast({ title: '身份信息缺失，请重试', icon: 'none' });
      return;
    }

    if (!fileID) {
      wx.showToast({ title: '请上传附件', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '提交中...', mask: true });

    try {
      await db.collection('applications').add({
        data: {
          projectId,
          projectName,
          name,
          phone,
          reason,
          fileID: fileID || '',
          studentOpenId: currentOpenId,
          points: selectedScore || 0,
          status: '待审核',
          createTime: new Date()
        }
      });

      wx.hideLoading();
      wx.showToast({ 
        title: '提交成功', 
        icon: 'success',
        duration: 1500
      });

      setTimeout(() => {
        wx.navigateBack();
      }, 1600);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '提交失败', icon: 'none' });
      console.error('提交错误', err);
    }
  }
});