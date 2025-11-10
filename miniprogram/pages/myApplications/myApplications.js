const db = wx.cloud.database();

const MAX_LIMIT = 100;

Page({
  data: {
    applications: [],
    applicationGroups: []
  },

  onShow() {
    this.loadApplications();
  },

  // 加载当前用户申请记录
  async loadApplications() {
    try {
      const openRes = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openid = openRes.result?.openid;
      if (!openid) throw new Error('missing openid');

      const baseWhere = { _openid: openid };
      const countRes = await db.collection('applications').where(baseWhere).count();
      const total = countRes.total || 0;

      if (total === 0) {
        this.setData({ applications: [], applicationGroups: [] });
        return;
      }

      const tasks = [];
      const batches = Math.ceil(total / MAX_LIMIT);
      for (let i = 0; i < batches; i++) {
        tasks.push(
          db.collection('applications')
            .where(baseWhere)
            .orderBy('createTime', 'desc')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .get()
        );
      }
      const results = await Promise.all(tasks);
      const allRecords = results.flatMap(res => res.data || []);
      allRecords.sort((a, b) => {
        const timeA = new Date(a.createTime || 0).getTime();
        const timeB = new Date(b.createTime || 0).getTime();
        return timeB - timeA;
      });

      const formatted = allRecords.map(item => {
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
          pointsText: Array.isArray(item.points)
            ? item.points.join('/')
            : (item.points ?? 0),
          fileIDs,
          fileNames,
          createTimeFormatted: this.formatDateTime(item.createTime),
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
    } catch (err) {
      console.error('加载申请记录失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ applications: [], applicationGroups: [] });
    }
  },

  // 根据状态返回样式类名
  getStatusClass(status) {
    if (status === '已通过') return 'approved';
    if (status === '已驳回') return 'rejected';
    return 'pending';
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

  // 查看上传文件
  previewFile(e) {
    const appIndex = Number(e.currentTarget.dataset.appindex);
    const app = this.data.applications?.[appIndex];
    const fileIDs = app?.fileIDs || [];
    const fileNames = app?.fileNames || [];

    if (!fileIDs.length) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }

    const fileList = fileIDs.map((id, idx) => ({
      fileID: id,
      fileName: fileNames[idx] || `附件${idx + 1}`
    }));

    wx.showActionSheet({
      itemList: fileList.map(item => item.fileName),
      success: res => {
        const selected = fileList[res.tapIndex];
        if (!selected) return;
        this.openFile(selected.fileID);
      }
    });
  },

  openFile(fileID) {
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
