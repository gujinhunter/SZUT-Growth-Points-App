const AUTH_SERVICE = 'studentAuthService';

Page({
  data: {
    loading: false,
    profile: {},
    roleText: '学生',
    infoList: [],
    needBind: false
  },

  onLoad() {
    this.loadProfile();
  },

  onShow() {
    this.loadProfile();
  },

  onPullDownRefresh() {
    this.loadProfile();
  },

  async loadProfile() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: AUTH_SERVICE });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '获取信息失败');
      }

      const profile = result.data || {};
      const needBind = !profile.name || !profile.studentId;
      const roleText = profile.role === 'admin' ? '管理员' : '学生';
      const infoList = this.buildInfoList(profile, roleText);

      this.setData({ profile, roleText, infoList, needBind });
    } catch (err) {
      console.error('加载个人信息失败', err);
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      wx.stopPullDownRefresh();
      this.setData({ loading: false });
    }
  },

  buildInfoList(profile = {}, roleText = '学生') {
    return [
      { label: '姓名', value: profile.name || '' },
      { label: '学号', value: profile.studentId || '' },
      { label: '学院', value: profile.academy || '' },
      { label: '班级', value: profile.className || '' },
      { label: '联系电话', value: profile.phone || '' },
      { label: '当前角色', value: roleText }
    ];
  },

  goBind() {
    wx.navigateTo({
      url: '/pages/student/login/login'
    });
  }
});

