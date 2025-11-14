const AUTH_SERVICE = 'adminAuthService';
const USER_SERVICE = 'adminUserService';

Page({
  data: {
    keyword: '',
    rolePickerList: [
      { label: '全部角色', value: '' },
      { label: '学生', value: 'student' },
      { label: '管理员', value: 'admin' }
    ],
    rolePickerIndex: 0,
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    loading: false
  },

  async onLoad() {
    const ok = await this.ensureAdmin();
    if (ok) {
      this.loadUsers(true);
    }
  },

  onPullDownRefresh() {
    this.loadUsers(true).finally(() => wx.stopPullDownRefresh());
  },

  async ensureAdmin() {
    try {
      const res = await wx.cloud.callFunction({
        name: AUTH_SERVICE,
        data: { action: 'ensureAdmin' }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '无管理员权限');
      }
      return true;
    } catch (err) {
      console.error('管理员身份校验失败', err);
      wx.showModal({
        title: '无权限',
        content: err.message || '当前账号没有管理员权限',
        showCancel: false,
        success: () => wx.navigateBack()
      });
      return false;
    }
  },

  async loadUsers(reset = false) {
    if (this.data.loading) return;
    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true });
    try {
      const data = await this.callUserService('listUsers', {
        page: nextPage,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        role: this.data.rolePickerList[this.data.rolePickerIndex]?.value || ''
      }, { showLoading: false });
      const list = this.decorateList(data.list || []);
      const mergedList = reset ? list : this.data.list.concat(list);
      const total = data.total || 0;
      const currentPage = data.page || nextPage;
      const hasMore = currentPage * this.data.pageSize < total;
      this.setData({
        list: mergedList,
        total,
        page: currentPage,
        hasMore
      });
    } catch (err) {
      console.error('用户列表获取失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  decorateList(list = []) {
    return list.map(item => {
      const createdAtText = this.formatDateTime(item.createdAt);
      const openidDisplay = this.formatOpenId(item.openid);
      return { ...item, createdAtText, openidDisplay };
    });
  },

  formatDateTime(timestamp) {
    if (!timestamp) return '—';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '—';
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const mi = `${date.getMinutes()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  },

  formatOpenId(openid) {
    if (!openid) return '未绑定';
    if (openid.length <= 16) return openid;
    return `${openid.slice(0, 8)}...${openid.slice(-4)}`;
  },

  onKeywordChange(e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearch() {
    this.loadUsers(true);
  },

  onRoleChange(e) {
    const index = Number(e.detail.value) || 0;
    this.setData({ rolePickerIndex: index }, () => this.loadUsers(true));
  },

  onResetFilters() {
    this.setData({ keyword: '', rolePickerIndex: 0 }, () => this.loadUsers(true));
  },

  refreshList() {
    this.loadUsers(true);
  },

  loadMore() {
    if (!this.data.hasMore || this.data.loading) return;
    this.loadUsers(false);
  },

  onReachBottom() {
    this.loadMore();
  },

  async toggleRole(e) {
    const userId = e.currentTarget.dataset.id;
    const currentRole = e.currentTarget.dataset.role;
    if (!userId) return;
    const targetRole = currentRole === 'admin' ? 'student' : 'admin';
    const confirmed = await this.showConfirm(
      targetRole === 'admin'
        ? '确定将该用户设为管理员吗？'
        : '确定将该管理员降为学生吗？'
    );
    if (!confirmed) return;
    try {
      await this.callUserService('updateRole', { userId, role: targetRole });
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.loadUsers(true);
    } catch (err) {
      console.error('角色更新失败', err);
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  async openActionSheet(e) {
    const index = Number(e.currentTarget.dataset.index);
    const user = this.data.list[index];
    if (!user) return;
    const options = [
      { label: '解除绑定（保留档案）', action: 'unbind' },
      { label: '彻底删除记录', action: 'delete' }
    ];
    wx.showActionSheet({
      itemList: options.map(item => item.label),
      success: async (res) => {
        const chosen = options[res.tapIndex];
        if (!chosen) return;
        if (chosen.action === 'unbind') {
          await this.handleUnbind(user, true);
        } else if (chosen.action === 'delete') {
          await this.handleUnbind(user, false);
        }
      }
    });
  },

  async handleUnbind(user, archive = true) {
    const confirmed = await this.showConfirm(
      archive
        ? '解除绑定后将保存档案并删除当前记录，确认继续？'
        : '删除后将无法恢复，确认彻底删除该用户？'
    );
    if (!confirmed) return;
    try {
      if (archive) {
        await this.callUserService('unbindUser', { userId: user._id });
      } else {
        await this.callUserService('deleteUser', { userId: user._id });
      }
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.loadUsers(true);
    } catch (err) {
      console.error('解绑/删除失败', err);
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  showConfirm(content) {
    return new Promise(resolve => {
      wx.showModal({
        title: '确认操作',
        content,
        confirmColor: '#d9534f',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
  },

  async callUserService(action, payload = {}, options = {}) {
    const { showLoading = true } = options;
    if (showLoading) {
      wx.showLoading({ title: '处理中...', mask: true });
    }
    try {
      const res = await wx.cloud.callFunction({
        name: USER_SERVICE,
        data: { action, payload }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '操作失败');
      }
      return result.data || {};
    } finally {
      if (showLoading) {
        wx.hideLoading();
      }
    }
  }
});

