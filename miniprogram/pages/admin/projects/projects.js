const db = wx.cloud.database();

Page({
  data: {
    projects: []
  },

  onShow() {
    this.loadProjects();
  },

  // 加载所有项目
  loadProjects() {
    db.collection('activities')
      .orderBy('category', 'asc')
      .get()
      .then(res => this.setData({ projects: res.data }))
      .catch(() => wx.showToast({ title: '加载失败', icon: 'none' }));
  },

  // 添加项目
  addProject() {
    wx.showModal({
      title: '添加项目',
      editable: true,
      placeholderText: '输入项目名称',
      success: res => {
        if (res.confirm && res.content) {
          db.collection('activities').add({
            data: {
              name: res.content,
              category: '其他',
              score: 0,
              createTime: new Date()
            }
          }).then(() => {
            wx.showToast({ title: '添加成功' });
            this.loadProjects();
          });
        }
      }
    });
  },

  // 编辑项目信息
  editProject(e) {
    const item = e.currentTarget.dataset.item;
    wx.showModal({
      title: '编辑项目',
      editable: true,
      placeholderText: `当前名称：${item.name}`,
      success: res => {
        if (res.confirm && res.content) {
          wx.showModal({
            title: '修改积分',
            editable: true,
            placeholderText: `当前积分：${item.score}`,
            success: res2 => {
              const newName = res.content;
              const newScore = Number(res2.content || item.score);
              db.collection('activities').doc(item._id).update({
                data: {
                  name: newName,
                  score: newScore
                }
              }).then(() => {
                wx.showToast({ title: '修改成功' });
                this.loadProjects();
              });
            }
          });
        }
      }
    });
  },

  // 删除项目
  deleteProject(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '是否确认删除该项目？',
      success: res => {
        if (res.confirm) {
          db.collection('activities').doc(id).remove().then(() => {
            wx.showToast({ title: '已删除' });
            this.loadProjects();
          });
        }
      }
    });
  }
});
