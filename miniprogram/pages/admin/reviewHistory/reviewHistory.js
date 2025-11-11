// miniprogram/pages/admin/reviewHistory/reviewHistory.js
const db = wx.cloud.database();
const _ = db.command;

const CATEGORY_BATCH = 20;
const DETAIL_BATCH = 20;
const LOG_BATCH_LIMIT = 20; // 云数据库单次最大返回量
const MAX_LOG_FETCH = 200;  // 最多拉取 200 条审核记录

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

  keywordTimer: null,

  onLoad() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh());
  },

  onUnload() {
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = null;
    }
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
          const raw = item?.category;
          const list = Array.isArray(raw) ? raw : [raw];
          list.forEach(value => {
            const text = (value ?? '').toString().trim();
            if (text) set.add(text);
          });
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
    const { filters = {}, filterOptions = {} } = this.data;
    const statusIndex = Number(filters.statusIndex || 0);
    const statusOption = (filterOptions.statuses || [])[statusIndex];
    const statusValue = statusOption ? statusOption.value : '';

    if (statusValue) {
      return { afterStatus: statusValue };
    }
    return {};
  },

  async loadLogs({ skipLoading = false } = {}) {
    if (!skipLoading) this.setData({ loading: true });
    try {
      const query = this.buildQuery();
      const countRes = await db.collection('reviewLogs')
        .where(query)
        .count();
      const totalCount = Math.min(countRes.total || 0, MAX_LOG_FETCH);

      if (totalCount === 0) {
        this.setData({
          logs: [],
          emptyText: '暂无审核记录',
          loading: false
        });
        return;
      }

      const batches = Math.ceil(totalCount / LOG_BATCH_LIMIT);
      const tasks = [];
      for (let i = 0; i < batches; i++) {
        tasks.push(
          db.collection('reviewLogs')
            .where(query)
            .orderBy('createTime', 'desc')
            .skip(i * LOG_BATCH_LIMIT)
            .limit(LOG_BATCH_LIMIT)
            .get()
        );
      }

      const results = await Promise.all(tasks);
      let rawLogs = results.flatMap(res => res.data || []);
      rawLogs.sort((a, b) => {
        const timeA = new Date(a.createTime || 0).getTime();
        const timeB = new Date(b.createTime || 0).getTime();
        return timeB - timeA;
      });
      rawLogs = rawLogs.slice(0, totalCount);

      const applicationIds = [...new Set(rawLogs.map(item => item.applicationId).filter(Boolean))];
      const projectIds = [...new Set(rawLogs.map(item => item.projectId).filter(Boolean))];
      const adminIds = [...new Set(rawLogs.map(item => item.adminOpenId).filter(Boolean))];

      const [applications, projects, admins] = await Promise.all([
        this.fetchApplications(applicationIds),
        this.fetchProjects(projectIds),
        this.fetchAdmins(adminIds)
      ]);

      const studentOpenIds = [...new Set(
        Array.from(applications.values())
          .map(app => app?.studentOpenId || app?._openid)
          .filter(Boolean)
      )];
      const students = await this.fetchStudents(studentOpenIds);

      let logs = rawLogs.map(item => {
        const app = item.applicationId ? applications.get(item.applicationId) : null;
        const project = item.projectId ? projects.get(item.projectId) : null;
        const admin = item.adminOpenId ? admins.get(item.adminOpenId) : null;
        const studentKey = app?.studentOpenId || app?._openid;
        const studentInfo = studentKey ? students.get(studentKey) : null;

        const projectName = project?.name || app?.projectName || '—';
        const projectCategory = project?.category || app?.projectCategory || '—';
        const studentName = studentInfo?.name || app?.name || app?._openid || '未知申请人';
        const studentId = studentInfo?.studentId || app?.studentId || '—';
        const adminName = admin?.name || '管理员';
        const remark = item.remark || '';

        const searchText = [
          projectName,
          projectCategory,
          studentName,
          studentId,
          adminName,
          remark
        ].map(val => (val || '').toString().toLowerCase()).join(' ');

        return {
          _id: item._id,
          projectName,
          projectCategory,
          studentName,
          studentId,
          applicationTime: app?.createTime || item.createTime || null,
          applicationTimeFormatted: this.formatDateTime(app?.createTime || item.createTime),
          adminName,
          remark,
          afterStatus: item.afterStatus,
          afterStatusText: item.afterStatus || '—',
          createTime: item.createTime || null,
          createTimeFormatted: this.formatDateTime(item.createTime),
          action: item.action || '',
          _searchText: searchText
        };
      });

      const categoryValue = this.data.filterOptions.categories[this.data.filters.categoryIndex]?.value;
      if (categoryValue) {
        logs = logs.filter(item => item.projectCategory === categoryValue);
      }

      const keywordValue = (this.data.keyword || '').trim().toLowerCase();
      if (keywordValue) {
        logs = logs.filter(item => item._searchText.includes(keywordValue));
      }

      this.setData({
        logs,
        emptyText: logs.length ? '' : '暂无审核记录',
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
          studentOpenId: true,
          projectName: true,
          projectCategory: true,
          createTime: true,
          _openid: true
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

  async fetchStudents(openIds) {
    if (!openIds.length) return new Map();
    const map = new Map();
    const BATCH = 20;
    for (let i = 0; i < openIds.length; i += BATCH) {
      const batch = openIds.slice(i, i + BATCH);
      const res = await db.collection('users')
        .where({ _openid: _.in(batch) })
        .field({
          _openid: true,
          name: true,
          realName: true,
          nickName: true,
          studentId: true,
          studentID: true,
          studentNo: true
        })
        .get();
      (res.data || []).forEach(item => {
        const key = item._openid;
        if (!key) return;
        map.set(key, {
          name: item.name || item.realName || item.nickName || '',
          studentId: item.studentId || item.studentID || item.studentNo || ''
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
    const value = e.detail.value || '';
    this.setData({ keyword: value });
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
    }
    this.keywordTimer = setTimeout(() => {
      this.loadLogs({ skipLoading: false });
    }, 400);
  },

  onKeywordClear() {
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = null;
    }
    this.setData({ keyword: '' }, () => {
      this.loadLogs({ skipLoading: false });
    });
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