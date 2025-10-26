// pages/apply/apply.js
// pages/apply/apply.js
const db = wx.cloud.database();
Page({
  data: {
    project: {},
    projectId: '',
    desc: '',
    date: '',
    attachments: []
  },
  onLoad(options) {
    const pid = options.projectId;
    this.setData({ projectId: pid });
    db.collection('projects').doc(pid).get().then(res=>{
      this.setData({ project: res.data });
    });
  },
  onDesc(e){ this.setData({ desc: e.detail.value }); },
  onDateChange(e){ this.setData({ date: e.detail.value }); },
  chooseFile() {
    wx.chooseMessageFile({
      count: 5,
      type: 'file',
      success: async (res) => {
        const file = res.tempFiles[0];
        // 上传到云存储
        const suffix = file.name.split('.').pop();
        const cloudPath = `applications/${Date.now()}_${Math.floor(Math.random()*1000)}.${suffix}`;
        wx.showLoading({ title: '上传中' });
        try {
          const up = await wx.cloud.uploadFile({ cloudPath, filePath: file.path });
          const fileID = up.fileID;
          const attachments = this.data.attachments.concat({ fileID, name: file.name });
          this.setData({ attachments });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },
  submit() {
    if (!this.data.date || !this.data.desc) {
      wx.showToast({ title: '请填写完整', icon: 'none' }); return;
    }
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res=>{
      const openid = res.result.openid;
      const doc = {
        projectId: this.data.projectId,
        projectName: this.data.project.name,
        studentOpenId: openid,
        desc: this.data.desc,
        date: this.data.date,
        attachments: this.data.attachments,
        status: 'pending',
        createdAt: db.serverDate()
      };
      db.collection('applications').add({ data: doc }).then(()=>{
        wx.showToast({ title: '提交成功' });
        wx.navigateBack();
      });
    });
  }
});
