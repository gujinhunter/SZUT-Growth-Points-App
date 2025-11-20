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
      { label: '专业', value: profile.major || '' },
      { label: '班级', value: profile.className || '' }
    ];
  },

  editPhone() {
    if (this.data.needBind) {
      wx.showToast({ title: '请先完成绑定', icon: 'none' });
      return;
    }
    const defaultPhone = this.data.profile.phone || '';
    wx.showModal({
      title: '修改联系电话',
      content: defaultPhone,
      editable: true,
      placeholderText: '请输入联系电话',
      confirmText: '保存',
      success: async (res) => {
        if (!res.confirm) return;
        const newPhone = (res.content || '').trim();
        if (!newPhone) {
          wx.showToast({ title: '请输入联系电话', icon: 'none' });
          return;
        }
        if (!/^[\d+\-]{5,20}$/.test(newPhone)) {
          wx.showToast({ title: '联系电话格式不正确', icon: 'none' });
          return;
        }
        await this.savePhone(newPhone);
      }
    });
  },

  async savePhone(phone) {
    try {
      wx.showLoading({ title: '保存中...', mask: true });
      const res = await wx.cloud.callFunction({
        name: AUTH_SERVICE,
        data: { action: 'updatePhone', payload: { phone } }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '保存失败');
      }
      const savedPhone = result.data?.phone || phone;
      this.setData({ 'profile.phone': savedPhone });
      wx.showToast({ title: '已更新', icon: 'success' });
    } catch (err) {
      console.error('更新联系电话失败', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goBind() {
    wx.navigateTo({
      url: '/pages/student/login/login'
    });
  }
});

