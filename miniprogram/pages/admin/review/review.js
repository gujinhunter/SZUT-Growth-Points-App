const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,
    applications: [],
    keyword: '',
    currentAdminOpenId: '',
    filters: {
      categoryIndex: 0
    },
    filterOptions: {
      categories: [{ label: '全部类别', value: '' }]
    },
    rejectDialogVisible: false,
    rejectRemark: '',
    rejectTarget: null,
    rejectSubmitting: false
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
      // 从 activities 集合中获取所有独特的项目类别
      const MAX_LIMIT = 100;
      
      // 先获取总数
      const countRes = await db.collection('activities').count();
      const total = countRes.total || 0;
      
      if (total === 0) {
        this.setData({
          'filterOptions.categories': [{ label: '全部类别', value: '' }]
        });
        return;
      }
      
      // 计算需要分几次查询
      const batchTimes = Math.ceil(total / MAX_LIMIT);
      
      // 并行发起所有查询
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        tasks.push(
          db.collection('activities')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .field({ category: true })
            .get()
        );
      }
      
      // 等待所有查询完成
      const results = await Promise.all(tasks);
      
      // 合并所有结果并去重
      const categories = new Set();
      results.forEach(result => {
        if (result && result.data) {
          result.data.forEach(item => {
            if (item && item.category && typeof item.category === 'string') {
              const trimmed = item.category.trim();
              if (trimmed) {
                categories.add(trimmed);
              }
            }
          });
        }
      });

      // 将类别转换为选项数组，并添加"全部类别"选项
      const sortedCategories = Array.from(categories).sort();
      const categoryOptions = [{ label: '全部类别', value: '' }].concat(
        sortedCategories.map(text => ({ label: text, value: text }))
      );

      this.setData({
        'filterOptions.categories': categoryOptions
      });
      
      // 调试信息
      console.log('成功加载类别数量:', sortedCategories.length, '总记录数:', total);
    } catch (err) {
      console.error('加载筛选项失败', err);
      wx.showToast({ title: '筛选数据加载失败', icon: 'none' });
      // 设置默认值
      this.setData({
        'filterOptions.categories': [{ label: '全部类别', value: '' }]
      });
    }
  },

  buildQuery() {
    const conditions = [];

    // 固定只查询待审核状态
    conditions.push({ status: '待审核' });

    // 注意：类别筛选不在数据库查询中处理，因为类别需要从 activities 集合获取
    // 类别筛选在 loadApplications 方法中获取完数据后处理

    // 关键词搜索（姓名、项目名称）
    const keyword = (this.data.keyword || '').trim();
    if (keyword) {
      const reg = db.RegExp({ regexp: keyword, options: 'i' });
      conditions.push(_.or([
        { name: reg },
        { projectName: reg }
      ]));
    }

    if (conditions.length === 1) {
      return conditions[0];
    }
    return _.and(conditions);
  },

  async loadApplications() {
    this.setData({ loading: true });
    try {
      const keyword = (this.data.keyword || '').trim();
      let res;

      // 如果有关键词搜索，需要分页获取所有待审核数据在内存中过滤
      if (keyword) {
        let allData = [];
        const MAX_LIMIT = 20;
        let skip = 0;
        let hasMore = true;

        while (hasMore) {
          const batchRes = await db.collection('applications')
            .where({ status: '待审核' })
            .skip(skip)
            .limit(MAX_LIMIT)
            .orderBy('createTime', 'desc')
            .get();

          allData = allData.concat(batchRes.data || []);
          skip += batchRes.data.length;
          hasMore = batchRes.data.length === MAX_LIMIT;
        }

        res = { data: allData };
      } else {
        // 无关键词时，直接使用数据库查询
        const query = this.buildQuery();
        res = await db.collection('applications')
          .where(query)
          .orderBy('createTime', 'desc')
          .get();
      }

      // 获取所有申请对应的学号信息和项目类别信息
      const studentOpenIds = [...new Set((res.data || []).map(item => item.studentOpenId).filter(id => id))];
      const projectIds = [...new Set((res.data || []).map(item => item.projectId).filter(id => id))];
      
      // 批量查询用户信息
      const userMap = new Map();
      if (studentOpenIds.length > 0) {
        // 分批查询用户（每次最多20个）
        const BATCH_SIZE = 20;
        for (let i = 0; i < studentOpenIds.length; i += BATCH_SIZE) {
          const batch = studentOpenIds.slice(i, i + BATCH_SIZE);
          const userQueries = batch.map(openId => 
            db.collection('users').where({ _openid: openId }).get()
          );
          const userResults = await Promise.all(userQueries);
          
          userResults.forEach((userRes, index) => {
            if (userRes.data && userRes.data.length > 0) {
              const user = userRes.data[0];
              userMap.set(batch[index], user.studentId || '');
            }
          });
        }
      }

      // 批量查询项目信息（获取类别）
      const projectMap = new Map();
      if (projectIds.length > 0) {
        // 分批查询项目（每次最多20个）
        const BATCH_SIZE = 20;
        for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
          const batch = projectIds.slice(i, i + BATCH_SIZE);
          const projectQueries = batch.map(projectId => 
            db.collection('activities').doc(projectId).get()
          );
          const projectResults = await Promise.all(projectQueries);
          
          projectResults.forEach((projectRes, index) => {
            if (projectRes.data) {
              const project = projectRes.data;
              projectMap.set(batch[index], project.category || '未分类');
            }
          });
        }
      }

      // 合并申请数据、用户数据和项目数据
      const apps = (res.data || []).map(item => {
        const studentId = item.studentOpenId ? (userMap.get(item.studentOpenId) || '') : '';
        const projectCategory = item.projectId ? (projectMap.get(item.projectId) || '未分类') : '未分类';
        const fileIDs = Array.isArray(item.fileIDs)
          ? item.fileIDs
          : item.fileID
            ? [item.fileID]
            : [];
        const hasNumberPoints = typeof item.points === 'number' && !Number.isNaN(item.points);
        const pointsDisplay = hasNumberPoints
          ? item.points
          : (Array.isArray(item.points) && item.points.length
              ? item.points.join('/')
              : (item.points === 0 ? 0 : (item.points || '—')));
        
        return {
          ...item,
          studentId: studentId, // 从 users 集合获取的学号
          projectCategory: projectCategory, // 从 activities 集合获取的类别
          fileIDs,
          pointsDisplay,
          createTimeFormatted: this.formatDateTime(item.createTime),
          statusClass: 'pending'
        };
      });

      let filteredApps = apps;

      const keywordLower = (this.data.keyword || '').trim().toLowerCase();
      if (keywordLower) {
        filteredApps = filteredApps.filter(item => {
          const fields = [
            item.name,
            item.projectName,
            item.studentId,
            item.projectCategory,
            item.reason
          ];
          return fields.some(field =>
            (field || '').toString().toLowerCase().includes(keywordLower)
          );
        });
      }

      const categoryValue = this.data.filterOptions.categories[this.data.filters.categoryIndex]?.value;
      if (categoryValue) {
        filteredApps = filteredApps.filter(item => item.projectCategory === categoryValue);
      }
      
      this.setData({ applications: filteredApps });
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

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadApplications();
    });
  },

  noop() {},

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/admin/reviewDetail/reviewDetail?id=${id}`
    });
  },

  previewFile(e) {
    e.stopPropagation?.();
    const fileIDs = e.currentTarget.dataset.fileids;
    const list = Array.isArray(fileIDs) ? fileIDs : (fileIDs ? [fileIDs] : []);
    if (!list.length) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }

    wx.showActionSheet({
      itemList: list.map((_, idx) => `附件${idx + 1}`),
      success: res => {
        const fileID = list[res.tapIndex];
        if (!fileID) return;
        this.openFile(fileID);
      }
    });
  },

  openFile(fileID) {
    if (!fileID) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开附件...' });
    wx.cloud.callFunction({
      name: 'getFileTempUrl',
      data: { fileIDs: [fileID] }
    }).then(async res => {
      const fileList = res.result?.data;
      const info = Array.isArray(fileList) ? fileList[0] : null;
      const tempUrl = info?.tempFileURL;
      if (!tempUrl) {
        throw new Error(info?.errMsg || 'empty temp url');
      }

      const lower = (fileID || '').toLowerCase();
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const isImage = imageExts.some(ext => lower.includes(ext));

      if (isImage) {
        wx.hideLoading();
        wx.previewImage({
          urls: [tempUrl],
          current: tempUrl
        });
        return;
      }

      const downloadRes = await wx.downloadFile({ url: tempUrl });
      wx.hideLoading();
      if (downloadRes.statusCode !== 200) {
        throw new Error(`download fail: ${downloadRes.statusCode}`);
      }
      wx.openDocument({
        filePath: downloadRes.tempFilePath,
        fail: err => {
          console.error('打开附件失败', err);
          wx.showToast({ title: '无法打开文件', icon: 'none' });
        }
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('附件打开失败', err);
      wx.showToast({ title: '打开失败', icon: 'none' });
    });
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

  async handleApprove(e) {
    e.stopPropagation?.();
    const appId = e.currentTarget.dataset.id;
    if (!appId) return;
  
    const target = this.data.applications.find(item => item._id === appId);
    wx.showModal({
      title: '确认通过',
      content: '确认将该申请设置为"已通过"并发放积分吗？',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          const appDoc = await db.collection('applications').doc(appId).get();
          const studentOpenId = appDoc.data?.studentOpenId;
          const pointsToAdd = appDoc.data?.points || 0;
  
          await db.collection('applications').doc(appId).update({
            data: {
              status: '已通过',
              reviewTime: new Date()
            }
          });
  
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
            projectId: target?.projectId || null,
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

    const target = this.data.applications.find(item => item._id === appId) || null;
    this.setData({
      rejectDialogVisible: true,
      rejectRemark: '',
      rejectTarget: target ? { ...target } : { _id: appId }
    });
  },

  closeRejectDialog() {
    this.setData({
      rejectDialogVisible: false,
      rejectRemark: '',
      rejectTarget: null
    });
  },

  onRejectInput(e) {
    this.setData({ rejectRemark: e.detail.value || '' });
  },

  async confirmReject() {
    if (this.data.rejectSubmitting) return;
    const remark = (this.data.rejectRemark || '').trim();
    const target = this.data.rejectTarget;
    const appId = target?._id;
    if (!appId) {
      this.closeRejectDialog();
      return;
    }
    if (!remark) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' });
      return;
    }

    this.setData({ rejectSubmitting: true });
    wx.showLoading({ title: '处理中...' });
    try {
      await db.collection('applications').doc(appId).update({
        data: {
          status: '已驳回',
          reviewTime: new Date(),
          rejectRemark: remark
        }
      });

      await this.logReviewAction({
        applicationId: appId,
        action: 'rejected',
        projectId: target?.projectId || null,
        beforeStatus: target?.status || '',
        afterStatus: '已驳回',
        remark
      });

      wx.hideLoading();
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.closeRejectDialog();
      this.loadApplications();
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: '驳回失败', icon: 'none' });
      console.error('confirmReject error', error);
    } finally {
      this.setData({ rejectSubmitting: false });
    }
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