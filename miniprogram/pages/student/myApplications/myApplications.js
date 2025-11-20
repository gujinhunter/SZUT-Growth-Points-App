const APPLICATION_SERVICE = 'studentApplicationsService';

Page({
  data: {
    loading: true,
    applications: [],
    applicationGroups: []
  },

  onShow() {
    this.loadApplications();
  },

  onPullDownRefresh() {
    this.loadApplications();
  },

  async loadApplications() {
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await callApplicationService('listApplications', { page: 1, pageSize: 200 });
      const list = res?.list || [];
      const groups = res?.groups || [];

      // 前端格式化时间，确保使用本地时区
      const formattedList = list.map(item => ({
        ...item,
        createTimeFormatted: item.createTime ? this.formatDateTime(item.createTime) : '',
        reviewTimeFormatted: item.reviewTime ? this.formatDateTime(item.reviewTime) : '',
        latestTimeFormatted: item.latestTime ? this.formatDateTime(item.latestTime) : '',
        rejectHistoryFormatted: Array.isArray(item.rejectHistory)
          ? item.rejectHistory.map(record => ({
              remark: record?.remark || '',
              timeFormatted: record?.time ? this.formatDateTime(record.time) : ''
            }))
          : []
      }));

      const formattedGroups = groups.map(group => ({
        ...group,
        list: group.list.map(item => ({
          ...item,
          createTimeFormatted: item.createTime ? this.formatDateTime(item.createTime) : '',
          reviewTimeFormatted: item.reviewTime ? this.formatDateTime(item.reviewTime) : '',
          latestTimeFormatted: item.latestTime ? this.formatDateTime(item.latestTime) : ''
        }))
      }));

      this.setData({
        applications: formattedList,
        applicationGroups: formattedGroups,
        loading: false
      });
    } catch (err) {
      console.error('加载申请记录失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({
        applications: [],
        applicationGroups: [],
        loading: false
      });
    } finally {
      wx.hideLoading();
      wx.stopPullDownRefresh();
    }
  },

  formatDateTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mi = `${date.getMinutes()}`.padStart(2, '0');
    const ss = `${date.getSeconds()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  },

  previewFile(e) {
    const appIndex = Number(e.currentTarget.dataset.appindex);
    const app = this.data.applications?.[appIndex];
    const fileIDs = app?.fileIDs || [];
    const fileNames = app?.fileNames || fileIDs.map((_, idx) => `附件${idx + 1}`);

    if (!fileIDs.length) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }

    const options = fileIDs.map((id, idx) => ({ id, name: fileNames[idx] || `附件${idx + 1}` }));

    wx.showActionSheet({
      itemList: options.map(opt => opt.name),
      success: res => {
        const selected = options[res.tapIndex];
        if (!selected) return;
        this.openFile(selected.id);
      }
    });
  },

  async openFile(fileID) {
    if (!fileID) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '获取附件...' });
    try {
      const data = await callApplicationService('getFileUrl', { fileID });
      const tempUrl = data?.tempFileURL;
      if (!tempUrl) {
        throw new Error('无法获取附件链接');
      }

      wx.hideLoading();
      const lower = fileID.toLowerCase();
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const isImage = imageExts.some(ext => lower.includes(ext));
      if (isImage) {
        wx.previewImage({ urls: [tempUrl], current: tempUrl });
      } else {
        wx.downloadFile({
          url: tempUrl,
          success: res => {
            wx.openDocument({ filePath: res.tempFilePath });
          },
          fail: err => {
            console.error('下载附件失败', err);
            wx.showToast({ title: '文件无法打开', icon: 'none' });
          }
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('获取附件失败', err);
      wx.showToast({ title: err.message || '附件获取失败', icon: 'none' });
    }
  },

  handleResubmit(e) {
    const applicationId = e.currentTarget.dataset.id;
    const projectId = e.currentTarget.dataset.projectid || '';
    const projectName = e.currentTarget.dataset.projectname || '';
    if (!applicationId) return;
    const encodedName = projectName ? encodeURIComponent(projectName) : '';
    const url = `/pages/student/apply/apply?applicationId=${applicationId}&mode=edit${projectId ? `&projectId=${projectId}` : ''}${encodedName ? `&projectName=${encodedName}` : ''}`;
    wx.navigateTo({ url });
  }
});

async function callApplicationService(action, payload = {}) {
  const res = await wx.cloud.callFunction({
    name: APPLICATION_SERVICE,
    data: { action, payload }
  });
  const result = res.result || {};
  if (!result.success) {
    throw new Error(result.message || '云函数调用失败');
  }
  return result.data;
}
