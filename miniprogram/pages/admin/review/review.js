const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,
    applications: [],
    keyword: '',
    currentAdminOpenId: '',
    filters: {
      statusIndex: 1,
      categoryIndex: 0,
      regionIndex: 0
    },
    filterOptions: {
      statuses: [
        { label: '全部状态', value: '' },
        { label: '待审核', value: '待审核' },
        { label: '已通过', value: '已通过' },
        { label: '已驳回', value: '已驳回' }
      ],
      categories: [{ label: '全部类别', value: '' }],
      regions: [{ label: '全部地区', value: '' }]
    }
  },

  async onLoad() {
    await this.ensureAdminOpenId();
    await this.loadFilterOptions();
    this.loadApplications();
  },

  onPullDownRefresh() {
    this.loadApplications().finally(() => wx.stopPullDownRefresh());
  },

  async ensureAdminOpenId() {
    if (this.data.currentAdminOpenId) return;
    try {
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      this.setData({ currentAdminOpenId: res.result.openid || '' });
    } catch (err) {
      console.error('获取管理员 openid 失败', err);
      wx.showToast({ title: '无法识别身份', icon: 'none' });
    }
  },

  async loadFilterOptions() {
    try {
      const categories = new Set();
      const regions = new Set();
      let hasMore = true;
      let skip = 0;
      const pageSize = 100;

      while (hasMore) {
        const res = await db.collection('applications')
          .skip(skip)
          .limit(pageSize)
          .field({
            projectCategory: true,
            projectRegion: true
          })
          .get();

        res.data.forEach(item => {
          if (item.projectCategory) categories.add(item.projectCategory);
          if (item.projectRegion) regions.add(item.projectRegion);
        });

        skip += res.data.length;
        hasMore = res.data.length === pageSize;
        if (!hasMore) break;
      }

      this.setData({
        'filterOptions.categories': [{ label: '全部类别', value: '' }].concat(
          Array.from(categories).map(text => ({ label: text, value: text }))
        ),
        'filterOptions.regions': [{ label: '全部地区', value: '' }].concat(
          Array.from(regions).map(text => ({ label: text, value: text }))
        )
      });
    } catch (err) {
      console.error('加载筛选项失败', err);
      wx.showToast({ title: '筛选数据加载失败', icon: 'none' });
    }
  },

  buildQuery() {
    const { filterOptions, filters } = this.data;
    const conditions = [];

    const statusValue = filterOptions.statuses[filters.statusIndex]?.value;
    if (statusValue) {
      conditions.push({ status: statusValue });
    }

    const categoryValue = filterOptions.categories[filters.categoryIndex]?.value;
    if (categoryValue) {
      conditions.push({ projectCategory: categoryValue });
    }

    const regionValue = filterOptions.regions[filters.regionIndex]?.value;
    if (regionValue) {
      conditions.push({ projectRegion: regionValue });
    }

    const keyword = (this.data.keyword || '').trim();
    if (keyword) {
      const reg = db.RegExp({ pattern: keyword, options: 'i' });
      conditions.push(_.or([
        { name: reg },
        { studentId: reg },
        { projectName: reg }
      ]));
    }

    if (!conditions.length) {
      return {};
    }
    if (conditions.length === 1) {
      return conditions[0];
    }
    return _.and(conditions);
  },

  async loadApplications() {
    this.setData({ loading: true });
    try {
      const query = this.buildQuery();
      const res = await db.collection('applications')
        .where(query)
        .orderBy('createTime', 'desc')
        .get();

      const apps = (res.data || []).map(item => ({
        ...item,
        createTimeFormatted: item.createTime ? new Date(item.createTime).toLocaleString() : '',
        statusClass: item.status === '已通过'
          ? 'approved'
          : item.status === '已驳回'
            ? 'rejected'
            : 'pending'
      }));
      this.setData({ applications: apps });
    } catch (err) {
      console.error('加载申请失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ applications: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearchConfirm() {
    this.loadApplications();
  },

  onSearch() {
    this.loadApplications();
  },

  clearKeyword() {
    this.setData({ keyword: '' });
    this.loadApplications();
  },

  onStatusChange(e) {
    this.setData({ 'filters.statusIndex': Number(e.detail.value) || 0 }, () => {
      this.loadApplications();
    });
  },

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadApplications();
    });
  },

  onRegionChange(e) {
    this.setData({ 'filters.regionIndex': Number(e.detail.value) || 0 }, () => {
      this.loadApplications();
    });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/admin/reviewDetail/reviewDetail?id=${id}`
    });
  },

  previewFile(e) {
    e.stopPropagation?.();
    const fileID = e.currentTarget.dataset.fileid;
    if (!fileID) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开附件...' });
    wx.cloud.downloadFile({ fileID })
      .then(res => {
        wx.hideLoading();
        // 判断是否为图片文件
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
        const isImage = imageExts.some(ext => fileID.toLowerCase().includes(ext));
        
        if (isImage) {
          // 图片用预览
          wx.previewImage({
            urls: [res.tempFilePath],
            current: res.tempFilePath
          });
        } else {
          // 文档用打开
          wx.openDocument({
            filePath: res.tempFilePath
          });
        }
      })
      .catch(err => {
        wx.hideLoading();
        console.error('附件打开失败', err);
        wx.showToast({ title: '打开失败', icon: 'none' });
      });
  },

  async handleApprove(e) {
    e.stopPropagation?.();
    const appId = e.currentTarget.dataset.id;
    const projectId = e.currentTarget.dataset.projectid || null;
    if (!appId) return;
  
    const target = this.data.applications.find(item => item._id === appId);
    wx.showModal({
      title: '确认通过',
      content: '确认将该申请设置为"已通过"并发放积分吗？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          // 获取申请信息以获取项目分值
          const appDoc = await db.collection('applications').doc(appId).get();
          const studentOpenId = appDoc.data?.studentOpenId;
          
          // 获取项目分值
          let pointsToAdd = 0;
          if (projectId) {
            const projDoc = await db.collection('activities').doc(projectId).get();
            const scoreField = projDoc.data?.score;
            if (Array.isArray(scoreField)) {
              pointsToAdd = Number(scoreField[0]) || 0;
            } else {
              pointsToAdd = Number(scoreField) || 0;
            }
          }
          
          // 更新申请状态并写入积分
          await db.collection('applications').doc(appId).update({
            data: {
              status: '已通过',
              reviewTime: new Date(),
              points: pointsToAdd
            }
          });
  
          // 给学生加积分
          if (studentOpenId && pointsToAdd > 0) {
            const userQuery = await db.collection('users').where({ _openid: studentOpenId }).get();
            if (userQuery.data && userQuery.data.length > 0) {
              const userDoc = userQuery.data[0];
              const newTotal = (userDoc.totalPoints || 0) + pointsToAdd;
              await db.collection('users').doc(userDoc._id).update({
                data: { totalPoints: newTotal }
              });
            }
          }
  
          await this.logReviewAction({
            applicationId: appId,
            action: 'approved',
            projectId,
            beforeStatus: target?.status || '',
            afterStatus: '已通过',
            remark: ''
          });
  
          wx.hideLoading();
          wx.showToast({ title: '已通过并发放积分', icon: 'success' });
          this.loadApplications();
        } catch (error) {
          console.error('handleApprove error', error);
          wx.hideLoading();
          wx.showToast({ title: '处理失败', icon: 'none' });
        }
      }
    });
  },

  handleReject(e) {
    e.stopPropagation?.();
    const appId = e.currentTarget.dataset.id;
    if (!appId) return;

    const target = this.data.applications.find(item => item._id === appId);
    wx.showModal({
      title: '确认驳回',
      content: '确认将该申请设置为“已驳回”？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await db.collection('applications').doc(appId).update({
            data: {
              status: '已驳回',
              reviewTime: new Date()
            }
          });

          await this.logReviewAction({
            applicationId: appId,
            action: 'rejected',
            projectId: target?.projectId || null,
            beforeStatus: target?.status || '',
            afterStatus: '已驳回',
            remark: ''
          });

          wx.hideLoading();
          wx.showToast({ title: '已驳回', icon: 'success' });
          this.loadApplications();
        } catch (error) {
          console.error('handleReject error', error);
          wx.hideLoading();
          wx.showToast({ title: '驳回失败', icon: 'none' });
        }
      }
    });
  },

  async logReviewAction({ applicationId, action, remark = '', projectId, beforeStatus = '', afterStatus = '' }) {
    await this.ensureAdminOpenId();
    if (!applicationId) return;
    try {
      await db.collection('reviewLogs').add({
        data: {
          applicationId,
          projectId: projectId || null,
          action,
          beforeStatus,
          afterStatus,
          remark,
          adminOpenId: this.data.currentAdminOpenId || '',
          createTime: new Date()
        }
      });
    } catch (err) {
      console.error('写入审核日志失败', err);
    }
  }
});