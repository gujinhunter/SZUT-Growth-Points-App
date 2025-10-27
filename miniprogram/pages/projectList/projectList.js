// pages/projectList/projectList.js
const db = wx.cloud.database();

Page({
  data: {
    activities: [],     // 所有活动数据
    loading: true,      // 加载状态
    activeCategory: null // 当前展开的分类（可用于折叠展开）
  },

  onLoad() {
    this.loadActivities();
  },

  // 从数据库加载数据（分批拉取）
  loadActivities() {
    wx.showLoading({ title: '加载中...' }); // 弹出加载中提示，提升用户体验
  
    const MAX_LIMIT = 20; // 每次最多取20条
    db.collection('activities').count().then(res => {
      const total = res.total; // 总记录数
      const batchTimes = Math.ceil(total / MAX_LIMIT); // 需要拉取的次数

      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        const promise = db.collection('activities')
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .get();
        tasks.push(promise);
      }
  
      // 等待所有批次请求完成
      Promise.all(tasks).then(results => {
        // 合并所有批次的数据
        let allData = results.reduce((acc, cur) => acc.concat(cur.data), []);
  
        // 按 category 分类整理
        const grouped = {};
        allData.forEach(item => {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        });
  
        const activities = Object.keys(grouped).map(category => ({
          category,
          items: grouped[category]
        }));
  
        this.setData({ activities, loading: false });
        wx.hideLoading();
      }).catch(err => {
        console.error('批量加载失败', err);
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
    });
  },
  

  // 点击分类标题展开/收起
  toggleCategory(e) {
    const { category } = e.currentTarget.dataset;
    this.setData({
      activeCategory: this.data.activeCategory === category ? null : category
    });
  },

  /* ❌ 删除：原先的 showDetail 弹窗函数
  showDetail(e) {
    const { item } = e.currentTarget.dataset;
    wx.showModal({
      title: item.name,
      content: `类别：${item.category}\n积分：${Array.isArray(item.score) ? item.score.join('/') : item.score}点\n说明：${item.remark || '无'}`,
      showCancel: false
    });
  }
  */

  // ✅ 新增：点击活动后跳转到 apply 页面
  goToApply(e) {
    const item = e.currentTarget.dataset.item;
    // 跳转到 apply 页面，同时传递项目 id 和名称
    wx.navigateTo({
      url: `/pages/apply/apply?projectId=${item._id}&projectName=${item.name}`
    });
  }
});
