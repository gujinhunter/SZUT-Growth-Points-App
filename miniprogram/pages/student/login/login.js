const AUTH_SERVICE = 'studentAuthService';
const APPLICATION_SERVICE = 'studentApplicationsService';

Page({
  data: {
    needBind: false,
    name: '',
    studentId: '',
    errorMessage: '',
    showAdminForm: false,
    adminName: '',
    adminWorkId: '',
    adminError: ''
  },

  async onLoad() {
    await this.checkProfile();
  },

  async checkProfile() {
    try {
      const res = await wx.cloud.callFunction({ name: AUTH_SERVICE });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '获取用户信息失败');
      }
      const profile = result.data || {};
      
      // 如果用户不存在（name 和 studentId 都为空）或没有 role，显示绑定界面
      const needsBind = !profile.role || (!profile.name && !profile.studentId);
      
      if (needsBind) {
        this.setData({ needBind: true });
      } else if (profile.role === 'admin') {
        wx.reLaunch({ url: '/pages/admin/home/home' });
      } else {
        wx.reLaunch({ url: '/pages/student/projectList/projectList' });
      }
    } catch (err) {
      console.error('检查用户信息失败', err);
      this.setData({ needBind: true });
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value, errorMessage: '' });
  },
  onIdInput(e) {
    this.setData({ studentId: e.detail.value, errorMessage: '' });
  },

  async bindUser() {
    const { name, studentId } = this.data;
    if (!name || !studentId) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    this.setData({ errorMessage: '' });
    try {
      wx.showLoading({ title: '绑定中...', mask: true });
      const res = await wx.cloud.callFunction({
        name: APPLICATION_SERVICE,
        data: { action: 'bindStudentProfile', payload: { name, studentId } }
      });
      const result = res.result || {};
      if (!result.success) {
        throw new Error(result.message || '绑定失败');
      }
      this.setData({ errorMessage: '' });
      wx.showToast({ title: '绑定成功', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/student/projectList/projectList' });
      }, 800);
    } catch (err) {
      console.error('绑定失败', err);
      const message = err?.message || '绑定失败';
      this.setData({ errorMessage: message });
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  toggleAdminForm() {
    this.setData({
      showAdminForm: !this.data.showAdminForm,
      adminError: ''
    });
  },

  onAdminNameInput(e) {
    this.setData({ adminName: e.detail.value, adminError: '' });
  },

  onAdminWorkIdInput(e) {
    this.setData({ adminWorkId: e.detail.value, adminError: '' });
  },

  async bindAdmin() {
    const { adminName, adminWorkId } = this.data;
    if (!adminName || !adminWorkId) {
      wx.showToast({ title: '请填写姓名与工号', icon: 'none' });
      return;
    }

    try {
      wx.showLoading({ title: '绑定中...', mask: true });
      const res = await wx.cloud.callFunction({
        name: 'adminAuthService',
        data: {
          action: 'registerAdmin',
          payload: { name: adminName.trim(), adminWorkId: adminWorkId.trim() }
        }
      });
      const result = res.result || {};
      if (!result.success) throw new Error(result.message || '绑定失败');
      wx.showToast({ title: '管理员绑定成功', icon: 'success' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/admin/home/home' });
      }, 800);
    } catch (err) {
      console.error('管理员绑定失败', err);
      const message = err?.message || '绑定失败';
      this.setData({ adminError: message });
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});





