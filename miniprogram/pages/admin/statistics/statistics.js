// pages/admin/statistics/statistics.js
// pages/admin/statistics/statistics.js
const db = wx.cloud.database();
Page({
  data:{ rankList: [] },
  onLoad(){ this.loadRank(); },
  loadRank(){
    db.collection('users').orderBy('totalPoints','desc').get().then(r=>{
      this.setData({ rankList: r.data });
    });
  },
  exportCsv(){
    wx.cloud.callFunction({ name: 'exportExport' }).then(res=>{
      // 返回 fileID 或 url，根据云函数实现
      const fileID = res.result.fileID;
      wx.showToast({ title: '导出完成' });
      // 可引导管理员下载或在云存储控制台获取
    });
  }
});
