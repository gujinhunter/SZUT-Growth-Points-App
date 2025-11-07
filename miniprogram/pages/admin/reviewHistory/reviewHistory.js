// miniprogram/pages/admin/reviewHistory/reviewHistory.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    loading: true,
    keyword: '',
    filters: {
      categoryIndex: 0,
      statusIndex: 0
    },
    filterOptions: {
      categories: [{ label: '全部类别', value: '' }],
      statuses: [
        { label: '全部状态', value: '' },
        { label: '已通过', value: '已通过' },
        { label: '已驳回', value: '已驳回' }
      ]
    },
    logs: [],
    emptyText: '暂无审核记录'
  },

  onLoad() {
    this.loadFilters();
    this.loadLogs();
  },

  onPullDownRefresh() {
    Promise.all([this.loadFilters(true), this.loadLogs(true)]).finally(() => wx.stopPullDownRefresh());
  },

  async loadFilters(skipReload) {
    try {
      const MAX_LIMIT = 100;
      const countRes = await db.collection('activities').count();
      const total = countRes.total || 0;

      if (total === 0) {
        this.setData({
          'filterOptions.categories': [{ label: '全部类别', value: '' }]
        });
        if (!skipReload) this.loadLogs();
        return;
      }

      const tasks = [];
      for (let i = 0; i < Math.ceil(total / MAX_LIMIT); i++) {
        tasks.push(
          db.collection('activities')
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .field({ category: true })
            .get()
        );
      }

      const results = await Promise.all(tasks);
      const categories = new Set();
      results.forEach(res => {
        (res.data || []).forEach(item => {
          const text = (item.category || '').trim();
          if (text) categories.add(text);
        });
      });

      const options = [{ label: '全部类别', value: '' }].concat(
        Array.from(categories)
          .sort()
          .map(text => ({ label: text, value: text }))
      );

      this.setData({
        'filterOptions.categories': options
      });
      if (!skipReload) this.loadLogs();
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '类别加载失败', icon: 'none' });
    }
  },

  buildQuery() {
    const conditions = [];

    const statusValue = this.data.filterOptions.statuses[this.data.filters.statusIndex]?.value;
    if (statusValue) {
      conditions.push({ afterStatus: statusValue });
    }

    const categoryValue = this.data.filterOptions.categories[this.data.filters.categoryIndex]?.value;
    if (categoryValue) {
      conditions.push({ projectCategory: categoryValue });
    }

    const keyword = (this.data.keyword || '').trim();
    if (keyword) {
      const reg = db.RegExp({ pattern: keyword, options: 'i' });
      conditions.push(_.or([
        { studentName: reg },
        { studentId: reg },
        { projectName: reg },
        { adminName: reg },
        { remark: reg }
      ]));
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return _.and(conditions);
  },

  async loadLogs(skipLoadingState = false) {
    if (!skipLoadingState) this.setData({ loading: true });
    try {
      const MAX_LIMIT = 50;
      const query = this.buildQuery();

      const res = await db.collection('reviewLogs')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(MAX_LIMIT)
        .get();

      const logs = res.data || [];
      if (!logs.length) {
        this.setData({ logs: [], emptyText: '暂无审核记录', loading: false });
        return;
      }

      const applicationIds = [...new Set(logs.map(item => item.applicationId).filter(Boolean))];
      const projectIds = [...new Set(logs.map(item => item.projectId).filter(Boolean))];
      const adminIds = [...new Set(logs.map(item => item.adminOpenId).filter(Boolean))];

      const [applications, projects, admins] = await Promise.all([
        this.fetchApplications(applicationIds),
        this.fetchProjects(projectIds),
        this.fetchAdmins(adminIds)
      ]);

      const enriched = logs.map(item => {
        const app = item.applicationId ? applications.get(item.applicationId) : null;
        const project = item.projectId ? projects.get(item.projectId) : null;
        const admin = item.adminOpenId ? admins.get(item.adminOpenId) : null;

        const projectCategory = project?.category || app?.projectCategory || '—';
        const studentName = app?.name || app?._openid || '未知申请人';
        const studentId = app?.studentId || '—';
        const projectName = project?.name || app?.projectName || '—';

        return {
          ...item,
          studentName,
          studentId,
          projectName,
          projectCategory,
          adminName: admin?.name || admin?.nickName || '管理员',
          createTimeFormatted: item.createTime ? new Date(item.createTime).toLocaleString() : '',
          afterStatusText: item.afterStatus || '—'
        };
      });

      this.setData({
        logs: enriched,
        emptyText: '',
        loading: false
      });
    } catch (err) {
      console.error('加载审核日志失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({
        loading: false,
        logs: [],
        emptyText: '加载失败，请下拉重试'
      });
    }
  },

  async fetchApplications(ids) {
    if (!ids.length) return new Map();
    const map = new Map();
    const BATCH = 20;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const res = await db.collection('applications')
        .where({ _id: _.in(batchIds) })
        .field({
          name: true,
          studentId: true,
          projectName: true,
          projectCategory: true,
          points: true
        })
        .get();
      (res.data || []).forEach(item => {
        map.set(item._id, item);
      });
    }
    return map;
  },

  async fetchProjects(ids) {
    if (!ids.length) return new Map();
    const map = new Map();
    const BATCH = 20;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const tasks = batchIds.map(projectId => db.collection('activities').doc(projectId).get());
      const results = await Promise.all(tasks);
      results.forEach((res, index) => {
        if (res.data) map.set(batchIds[index], { name: res.data.name || res.data.projectName || '', category: res.data.category || '' });
      });
    }
    return map;
  },

  async fetchAdmins(ids) {
    if (!ids.length) return new Map();
    const map = new Map();
    const BATCH = 20;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH);
      const res = await db.collection('admins')
        .where({ _openid: _.in(batchIds) })
        .field({ name: true, nickName: true })
        .get();
      (res.data || []).forEach(item => {
        map.set(item._openid, item);
      });
    }
    return map;
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearch() {
    this.loadLogs();
  },

  onSearchConfirm() {
    this.loadLogs();
  },

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadLogs();
    });
  },

  onStatusChange(e) {
    this.setData({ 'filters.statusIndex': Number(e.detail.value) || 0 }, () => {
      this.loadLogs();
    });
  }
});