// pages/admin/projects/projects.js
// pages/admin/projects/projects.js
const db = wx.cloud.database();
Page({
  data:{ projects: [] },
  onLoad(){ this.load(); },
  load(){ db.collection('projects').get().then(res=>this.setData({ projects: res.data })); },
  create(){ wx.navigateTo({ url: '/pages/admin/projects/edit?mode=create' }); },
  edit(e){ wx.navigateTo({ url: '/pages/admin/projects/edit?mode=edit&id=' + e.currentTarget.dataset.id }); },
  del(e){
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: '确认删除', success: res=>{
      if (res.confirm) {
        db.collection('projects').doc(id).remove().then(()=>this.load());
      }
    }});
  }
});
