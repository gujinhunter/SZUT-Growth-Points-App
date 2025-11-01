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
              ? '/pages/admin/home/home'
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
                  ? '/pages/admin/home/home'
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
  // 如果预先给予账号，则这一步不需要！！！   
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

// 1.r.data[0]是什么
// r.data 是查询结果数组，里边的每个元素都是 users 集合中的一条文档；
// 按理每个 openid 只对应一条记录，所以直接取 r.data[0] 即可得到当前用户的文档；
// 如果出现多条就是数据异常（可额外检查），若没有匹配则 r.data 为空数组。

// 2.前段页面如何实现调用js函数
// 在 WXML 里通过 bindtap / bindinput 等属性把组件事件绑定到对应的 JS 函数；
// 用户点击或输入时，小程序框架会触发事件，并自动在当前页面 Page({ ... }) 中调用同名函数；
// input 事件会把 e.detail.value 传入函数，通过 this.setData 实现数据更新和双向绑定。





