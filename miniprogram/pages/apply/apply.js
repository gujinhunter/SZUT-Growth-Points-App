const AUTH_SERVICE = 'studentAuthService';
const PROJECT_SERVICE = 'studentProjectService';
const FILE_SERVICE = 'studentFileService';
const APPLICATION_SERVICE = 'studentApplicationsService';

Page({
  data: {
    projectId: '',
    projectName: '',
    fileIDs: [],
    fileNames: [],
    profile: null,
    scoreOptions: [],
    selectedScoreIndex: 0,
    selectedScore: null,
    submitting: false,
    loadingProject: true
  },

  async onLoad(options) {
    const projectId = options.projectId || '';
    const projectName = options.projectName || '';
    this.setData({ projectId, projectName });

    try {
      await Promise.all([this.loadProfile(), this.loadProjectScore(projectId)]);
    } catch (err) {
      console.error('初始化失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  async loadProfile() {
    try {
      const res = await wx.cloud.callFunction({ name: AUTH_SERVICE });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '获取用户信息失败');
      }
      this.setData({ profile: result.data || null });
    } catch (err) {
      console.error('加载用户信息失败', err);
      wx.showToast({ title: '无法获取用户信息', icon: 'none' });
    }
  },

  async loadProjectScore(projectId) {
    if (!projectId) {
      this.setData({ loadingProject: false });
      return;
    }
    try {
      const res = await wx.cloud.callFunction({
        name: PROJECT_SERVICE,
        data: { action: 'getProjectDetail', payload: { projectId } }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '项目加载失败');
      }
      const scoreList = result.data?.scoreOptions || [];
      this.setData({
        scoreOptions: scoreList.map(s => String(s)),
        selectedScore: scoreList[0] || 0,
        loadingProject: false
      });
    } catch (err) {
      console.error('加载积分选项失败', err);
      wx.showToast({ title: err.message || '项目加载失败', icon: 'none' });
      this.setData({ loadingProject: false });
    }
  },

  onScoreChange(e) {
    const index = Number(e.detail.value || 0);
    const score = Number(this.data.scoreOptions[index] || 0);
    this.setData({
      selectedScoreIndex: index,
      selectedScore: score
    });
  },

  async chooseFile() {
    const remaining = Math.max(0, 3 - this.data.fileIDs.length);
    if (remaining === 0) {
      wx.showToast({ title: '最多上传 3 个附件', icon: 'none' });
      return;
    }

    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async res => {
        const paths = res.tempFilePaths || [];
        for (const path of paths) {
          await this.uploadFile({ tempFilePath: path });
        }
      },
      fail: err => {
        console.error('选择图片失败', err);
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    });
  },

  async uploadFile(file) {
    try {
      const filePath = file.tempFilePath || file.path;
      const fileName = file.name || (filePath ? filePath.split('/').pop() : 'attachment.jpg');
      const ext = fileName && fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '.jpg';
      const tokenRes = await wx.cloud.callFunction({
        name: FILE_SERVICE,
        data: { action: 'getUploadToken', payload: { fileExt: ext } }
      });
      const tokenData = tokenRes.result?.data;
      if (!tokenRes.result?.success || !tokenData?.cloudPath) {
        throw new Error(tokenRes.result?.message || '获取上传凭证失败');
      }

      wx.showLoading({ title: '上传中...', mask: true });
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: tokenData.cloudPath,
        filePath: filePath
      });

      wx.hideLoading();
      const newFileIDs = this.data.fileIDs.concat(uploadRes.fileID);
      const newFileNames = this.data.fileNames.concat(fileName || uploadRes.fileID.split('/').pop());
      this.setData({
        fileIDs: newFileIDs.slice(0, 3),
        fileNames: newFileNames.slice(0, 3)
      });
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('上传失败', err);
      wx.showToast({ title: err.message || '上传失败', icon: 'none' });
    }
  },

  async submitForm(e) {
    if (this.data.submitting) return;
    const { phone, reason } = e.detail.value;
    const { projectId, projectName, fileIDs, fileNames, selectedScore, profile } = this.data;

    if (!phone || !reason) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (!fileIDs.length) {
      wx.showToast({ title: '请上传附件', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: APPLICATION_SERVICE,
        data: {
          action: 'createApplication',
          payload: {
            projectId,
            projectName,
            phone,
            reason,
            fileIDs,
            fileNames,
            points: selectedScore
          }
        }
      });

      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '提交失败');
      }

      wx.hideLoading();
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('提交申请失败', err);
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});