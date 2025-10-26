const db = wx.cloud.database();

Page({
  data: {
    needBind: false,
    name: '',
    studentId: ''
  },

  onLoad() {
    // 检查是否已绑定
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      const openid = res.result.openid;
      db.collection('users').where({ _openid: openid }).get().then(r => {
        if (r.data.length > 0) {
          const user = r.data[0];
          wx.reLaunch({
            url: user.role === 'admin'
              ? '/pages/admin/review/review'
              : '/pages/projectList/projectList'
          });
        }
      });
    });
  },

  handleLogin() {
    wx.getUserProfile({
      desc: '用于绑定学生信息',
      success: (res) => {
        wx.cloud.callFunction({ name: 'getOpenId' }).then(result => {
          const openid = result.result.openid;
          db.collection('users').where({ _openid: openid }).get().then(r => {
            if (r.data.length === 0) {
              this.setData({ needBind: true }); // 未绑定 → 显示输入框
            } else {
              const user = r.data[0];
              wx.reLaunch({
                url: user.role === 'admin'
                  ? '/pages/admin/review/review'
                  : '/pages/projectList/projectList'
              });
            }
          });
        });
      }
    });
  },

  // 处理信息的录入，实现数据的双向绑定
  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onIdInput(e) { this.setData({ studentId: e.detail.value }); },

  // 处理当需要进行初次[微信号<——>用户]绑定，在后段数据库添加新用户，并重定向页面
  bindUser() {
    if (!this.data.name || !this.data.studentId) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }

    wx.cloud.callFunction({ name: 'getOpenId' }).then(res => {
      const user = {
        name: this.data.name,
        studentId: this.data.studentId,
        role: 'student',
        totalPoints: 0,
        createdAt: db.serverDate()
      };

      db.collection('users').add({ data: user }).then(() => {
        wx.showToast({ title: '绑定成功' });
        wx.reLaunch({ url: '/pages/projectList/projectList' });
      });
    });
  }
});
