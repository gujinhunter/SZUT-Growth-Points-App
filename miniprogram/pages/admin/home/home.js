// pages/admin/home/home.js
const db = wx.cloud.database();

Page({
  data: {
    userInfo: null
  },

  async onLoad() {
    wx.showLoading({ title: '验证身份中...', mask: true });

    try {
      // 调用云函数获取 openid
      const res = await wx.cloud.callFunction({ name: 'getOpenId' });
      const openid = res.result.openid;

      // 查询数据库中的用户信息
      const userRes = await db.collection('users').where({ openid }).get();

      if (userRes.data.length === 0) {
        wx.hideLoading();
        wx.showToast({ title: '用户未注册', icon: 'none' });
        wx.redirectTo({ url: '/pages/login/login' });
        return;
      }

      const user = userRes.data[0];

      // 检查角色
      if (user.role !== 'admin') {
        wx.hideLoading();
        wx.showToast({ title: '无管理员权限', icon: 'none' });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/login/login' });
        }, 1200);
        return;
      }

      // 如果是管理员，保存信息并允许访问
      this.setData({ userInfo: user });
      wx.hideLoading();
    } catch (error) {
      console.error('权限验证失败：', error);
      wx.hideLoading();
      wx.showToast({ title: '系统错误', icon: 'none' });
    }
  },

  goToPage(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  }
});

  