// pages/admin/review/review.js
// pages/admin/review/review.js
const db = wx.cloud.database();
Page({
  data:{ list: [], q: ''},
  onLoad() { this.fetch(); },
  fetch() {
    db.collection('applications').where({ status: 'pending' }).orderBy('createdAt','asc').get().then(res=>{
      this.setData({ list: res.data });
    });
  },
  onSearch(e){ this.setData({ q: e.detail.value }); },
  approve(e){
    const id = e.currentTarget.dataset.id;
    wx.cloud.callFunction({
      name: 'updateStatus',
      data: { applicationId: id, status: 'approved' }
    }).then(()=>{ wx.showToast({ title: '已通过' }); this.fetch(); });
  },
  reject(e){
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '驳回',
      editable: true,
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateStatus',
            data: { applicationId: id, status: 'rejected', remark: res.content || '不符合要求' }
          }).then(()=>{ wx.showToast({ title: '已驳回' }); this.fetch(); });
        }
      }
    });
  }
});
