// pages/projectList/projectList.js
// pages/projectList/projectList.js
const db = wx.cloud.database();
Page({
  data: { projects: [] },
  onLoad() { this.fetchProjects(); },
  fetchProjects() {
    db.collection('projects').orderBy('createdAt','desc').get().then(res=>{
      this.setData({ projects: res.data });
    });
  },
  applyToProject(e) {
    const projectId = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/apply/apply?projectId=' + projectId });
  }
});
