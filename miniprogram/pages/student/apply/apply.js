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
    loadingProject: true,
    applicationId: '',
    isEditMode: false,
    reasonText: '',
    rejectRemark: ''
  },

  async onLoad(options) {
    const projectId = options.projectId || '';
    const projectName = options.projectName ? decodeURIComponent(options.projectName) : '';
    const applicationId = options.applicationId || '';
    const isEditMode = options.mode === 'edit' && applicationId;
    this.setData({ projectId, projectName, applicationId, isEditMode });

    try {
      if (isEditMode) {
        await this.loadProfile();
        await this.loadApplicationDetail(applicationId);
        const pid = this.data.projectId;
        if (pid) {
          await this.loadProjectScore(pid, this.data.selectedScore);
        } else {
          this.setData({ loadingProject: false });
        }
      } else {
        await Promise.all([this.loadProfile(), this.loadProjectScore(projectId)]);
      }
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

  async loadProjectScore(projectId, targetPoints = null) {
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
      let selectedScoreIndex = 0;
      if (targetPoints !== null) {
        const idx = scoreList.findIndex(item => Number(item) === Number(targetPoints));
        if (idx >= 0) {
          selectedScoreIndex = idx;
        }
      }
      const selectedScore = Number(scoreList[selectedScoreIndex] ?? scoreList[0] ?? 0);
      this.setData({
        scoreOptions: scoreList,
        selectedScoreIndex,
        selectedScore,
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

  async loadApplicationDetail(applicationId) {
    wx.showLoading({ title: '加载申请信息...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: APPLICATION_SERVICE,
        data: { action: 'getApplicationDetail', payload: { applicationId } }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '获取申请详情失败');
      }
      const detail = result.data || {};
      const fileIDs = Array.isArray(detail.fileIDs) ? detail.fileIDs.slice(0, 3) : [];
      const fileNames = Array.isArray(detail.fileNames) && detail.fileNames.length
        ? detail.fileNames.slice(0, 3)
        : fileIDs.map((_, idx) => `附件${idx + 1}`);
      this.setData({
        projectId: detail.projectId || this.data.projectId,
        projectName: detail.projectName || this.data.projectName,
        fileIDs,
        fileNames,
        selectedScore: detail.points || 0,
        reasonText: detail.reason || '',
        rejectRemark: detail.rejectRemark || ''
      });
    } catch (err) {
      console.error('加载申请详情失败', err);
      wx.showToast({ title: err.message || '无法加载申请详情', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onReasonInput(e) {
    this.setData({ reasonText: e.detail.value });
  },

  resetFiles() {
    this.setData({ fileIDs: [], fileNames: [] });
    wx.showToast({ title: '附件已清空，请重新上传', icon: 'none' });
  },

  async submitForm(e) {
    if (this._submitLock) return;
    this._submitLock = true;
    if (this.data.submitting) {
      this._submitLock = false;
      return;
    }
    const { reason } = e.detail.value;
    const { projectId, projectName, fileIDs, fileNames, selectedScore, profile, isEditMode, applicationId } = this.data;

    if (!reason) {
      wx.showToast({ title: '请填写申请理由', icon: 'none' });
      this._submitLock = false;
      return;
    }
    if (!fileIDs.length) {
      wx.showToast({ title: '请上传附件', icon: 'none' });
      this._submitLock = false;
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: APPLICATION_SERVICE,
        data: {
          action: isEditMode ? 'resubmitApplication' : 'createApplication',
          payload: {
            applicationId: isEditMode ? applicationId : undefined,
            projectId,
            projectName,
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
      wx.showToast({ title: isEditMode ? '重新提交成功' : '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('提交申请失败', err);
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    } finally {
      this._submitLock = false;
      this.setData({ submitting: false });
    }
  }
});