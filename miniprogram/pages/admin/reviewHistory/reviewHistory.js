// miniprogram/pages/admin/reviewHistory/reviewHistory.js
const db = wx.cloud.database();
const _ = db.command;

const CATEGORY_BATCH = 100;
const DETAIL_BATCH = 20;
const PAGE_SIZE = 50;

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
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  async refresh() {
    await Promise.all([this.loadFilters(true), this.loadLogs({ skipLoading: false })]);
  },

  async loadFilters(skipReload = false) {
    try {
      const countRes = await db.collection('activities').count();
      const total = countRes.total || 0;
      if (total === 0) {
        this.setData({ 'filterOptions.categories': [{ label: '全部类别', value: '' }] });
        if (!skipReload) await this.loadLogs({ skipLoading: true });
        return;
      }

      const tasks = [];
      for (let i = 0; i < Math.ceil(total / CATEGORY_BATCH); i++) {
        tasks.push(
          db.collection('activities')
            .skip(i * CATEGORY_BATCH)
            .limit(CATEGORY_BATCH)
            .field({ category: true })
            .get()
        );
      }
      const results = await Promise.all(tasks);
      const set = new Set();
      results.forEach(res => {
        (res.data || []).forEach(item => {
          const text = (item.category || '').trim();
          if (text) set.add(text);
        });
      });

      const categories = [{ label: '全部类别', value: '' }].concat(
        Array.from(set)
          .sort()
          .map(text => ({ label: text, value: text }))
      );
      this.setData({ 'filterOptions.categories': categories });
      if (!skipReload) await this.loadLogs({ skipLoading: true });
    } catch (err) {
      console.error('加载类别失败', err);
      wx.showToast({ title: '类别加载失败', icon: 'none' });
    }
  },

  buildQuery() {
    const { filters, filterOptions, keyword } = this.data;
    const conditions = [];

    const status = filterOptions.statuses[filters.statusIndex]?.value;
    if (status) conditions.push({ afterStatus: status });

    const category = filterOptions.categories[filters.categoryIndex]?.value;
    if (category) conditions.push({ projectCategory: category });

    const kw = (keyword || '').trim();
    if (kw) {
      const reg = db.RegExp({ pattern: kw, options: 'i' });
      conditions.push(
        _.or([
          { studentName: reg },
          { studentId: reg },
          { projectName: reg },
          { adminName: reg },
          { remark: reg }
        ])
      );
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return _.and(conditions);
  },

  async loadLogs({ skipLoading = false } = {}) {
    if (!skipLoading) this.setData({ loading: true });
    try {
      const query = this.buildQuery();
      const res = await db.collection('reviewLogs')
        .where(query)
        .orderBy('createTime', 'desc')
        .limit(PAGE_SIZE)
        .get();

      const rawLogs = res.data || [];
      if (!rawLogs.length) {
        this.setData({
          logs: [],
          emptyText: '暂无审核记录',
          loading: false
        });
        return;
      }

      const applicationIds = [...new Set(rawLogs.map(item => item.applicationId).filter(Boolean))];
      const projectIds = [...new Set(rawLogs.map(item => item.projectId).filter(Boolean))];
      const adminIds = [...new Set(rawLogs.map(item => item.adminOpenId).filter(Boolean))];

      const [applications, projects, admins] = await Promise.all([
        this.fetchApplications(applicationIds),
        this.fetchProjects(projectIds),
        this.fetchAdmins(adminIds)
      ]);

      const logs = rawLogs.map(item => {
        const app = item.applicationId ? applications.get(item.applicationId) : null;
        const project = item.projectId ? projects.get(item.projectId) : null;
        const admin = item.adminOpenId ? admins.get(item.adminOpenId) : null;

        return {
          _id: item._id,
          projectName: project?.name || app?.projectName || '—',
          projectCategory: project?.category || app?.projectCategory || '—',
          studentName: app?.name || app?._openid || '未知申请人',
          studentId: app?.studentId || '—',
          adminName: admin?.name || '管理员',
          remark: item.remark || '',
          afterStatus: item.afterStatus,
          afterStatusText: item.afterStatus || '—',
          createTime: item.createTime || null,
          createTimeFormatted: this.formatDateTime(item.createTime),
          action: item.action || ''
        };
      });

      this.setData({
        logs,
        emptyText: '',
        loading: false
      });
    } catch (err) {
      console.error('加载审核日志失败', err);
      this.handleLoadError(err);
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
    for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
      const batch = ids.slice(i, i + DETAIL_BATCH);
      const res = await db.collection('applications')
        .where({ _id: _.in(batch) })
        .field({
          name: true,
          studentId: true,
          projectName: true,
          projectCategory: true
        })
        .get();
      (res.data || []).forEach(item => map.set(item._id, item));
    }
    return map;
  },

  async fetchProjects(ids) {
    if (!ids.length) return new Map();
    const map = new Map();
    for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
      const batch = ids.slice(i, i + DETAIL_BATCH);
      const tasks = batch.map(id => db.collection('activities').doc(id).get());
      const results = await Promise.all(tasks);
      results.forEach((res, index) => {
        if (res.data) {
          map.set(batch[index], {
            name: res.data.name || res.data.projectName || '',
            category: res.data.category || ''
          });
        }
      });
    }
    return map;
  },

  async fetchAdmins(ids) {
    if (!ids.length) return new Map();
    const map = new Map();
    for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
      const batch = ids.slice(i, i + DETAIL_BATCH);
      const res = await db.collection('users')
        .where({ _openid: _.in(batch) })
        .field({ name: true, realName: true, nickName: true, role: true })
        .get();
      (res.data || []).forEach(item => {
        map.set(item._openid, {
          name: item.name || item.realName || item.nickName || '管理员'
        });
      });
    }
    return map;
  },

  handleLoadError(err) {
    if (err && err.errCode === -502005) {
      wx.showModal({
        title: '缺少集合',
        content: '当前环境未创建 reviewLogs 集合，请在云开发控制台创建后再试。',
        showCancel: false
      });
    } else {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearch() {
    this.loadLogs({ skipLoading: false });
  },

  onSearchConfirm() {
    this.loadLogs({ skipLoading: false });
  },

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadLogs({ skipLoading: false });
    });
  },

  onStatusChange(e) {
    this.setData({ 'filters.statusIndex': Number(e.detail.value) || 0 }, () => {
      this.loadLogs({ skipLoading: false });
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
  }
});