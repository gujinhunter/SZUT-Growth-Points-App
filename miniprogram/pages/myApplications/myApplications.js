// pages/myApplications/myApplications.js
// pages/myApplications/myApplications.js
const db = wx.cloud.database();
Page({
  data: { list: [] },
  onLoad() {
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res=>{
      const openid = res.result.openid;
      db.collection('applications').where({ studentOpenId: openid }).orderBy('createdAt','desc').get().then(r=>{
        this.setData({ list: r.data });
      });
    });
  },
  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/apply/apply?applicationId=' + id });
  }
});
