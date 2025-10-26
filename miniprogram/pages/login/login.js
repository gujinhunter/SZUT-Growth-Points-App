Page({
    data: {
      isLoggedIn: false,
      isBound: false,
      name: '',
      studentId: ''
    },
  
    onLoad() {
      console.log("停留在登录页调试模式");
    },
  
    handleLogin(e) {
      console.log("微信一键登录", e);
      this.setData({
        isLoggedIn: true
      });
    },
  
    onNameInput(e) {
      this.setData({ name: e.detail.value });
    },
  
    onIdInput(e) {
      this.setData({ studentId: e.detail.value });
    },
  
    bindUser() {
      if (!this.data.name || !this.data.studentId) {
        wx.showToast({ title: '请填写完整信息', icon: 'none' });
        return;
      }
  
      // 1. 调用云函数获取 openid（每个用户唯一标识）
      wx.cloud.callFunction({
        name: 'getOpenId'
      }).then(res => {
        const openid = res.result.openid;
  
        // 2. 构造要存入数据库的用户对象
        const db = wx.cloud.database();
        const user = {
          _openid: openid,               // openid：小程序用户唯一标识
          name: this.data.name,          // 姓名
          studentId: this.data.studentId,// 学号
          role: 'student',               // 默认身份是学生
          createdAt: db.serverDate()     // 自动记录服务器时间
        };
  
        // 3. 保存数据到 "users" 集合
        db.collection('users').add({
          data: user
        }).then(() => {
          wx.showToast({ title: '绑定成功', icon: 'success' });
  
          // 4. 更新状态
          this.setData({
            isBound: true
          });
  
          // 5. 跳转到学生端首页（例如项目列表页）
          wx.reLaunch({
            url: '/pages/projectList/projectList'
          });
  
        }).catch(err => {
          console.error('保存失败:', err);
          wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        });
      }).catch(err => {
        console.error('获取openid失败:', err);
        wx.showToast({ title: '系统错误，请稍后重试', icon: 'none' });
      });
    }
  });
  