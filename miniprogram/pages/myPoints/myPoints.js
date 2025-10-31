// pages/myPoints/myPoints.js
const db = wx.cloud.database();
Page({

    data: {
        // 页面初始数据：这些数据将用于 WXML 文件中的渲染
        totalPoints: 0,     // 用户总积分
        averagePoints: 0,   // 学院平均分（或所有用户的平均分）
        rank: '-',          // 用户排名
        detail: []          // 积分明细列表
    },


  onLoad() {
    // 页面生命周期方法：在页面加载时（页面初始化时）立即执行。
    
    // 步骤 1: 调用云函数获取当前用户的 OpenID
    wx.cloud.callFunction({ name: 'getOpenId' }).then(res=>{
      // 下面是成功获取 OpenID 后执行的[回调函数] 

      // 将获取到的 OpenID 存储起来，OpenID 是用户在小程序/云环境中的唯一标识 
      const openid = res.result.openid;

      // --- 步骤 2: 获取用户总积分 ---
      // 1. 查询 'users' 集合
      // 2. 使用 `.where({ _openid: openid })` 筛选出当前用户的数据记录
      // 3. `.get()` 执行查询
      db.collection('users').where({ _openid: openid }).get().then(r=>{
        if (r.data.length) {
          // 检查是否找到了用户记录
          const u = r.data[0];
          // 如果找到，取出第一条记录
          this.setData({ totalPoints: u.totalPoints || 0 });
          // 更新页面数据：将用户记录中的 `totalPoints` 字段（如果不存在则默认为 0）更新到页面的 `totalPoints`
        }
      });

      // --- 步骤 3: 获取积分明细（已通过的申请） ---
      db.collection('applications').where({ studentOpenId: openid, status: 'approved' }).get().then(r=>{
      // 1. 查询 'applications' 集合
      // 2. 筛选条件：`studentOpenId` 必须是当前用户 AND `status` 必须是 'approved'（已通过）
        const details = r.data.map(a=>({ 
        // 映射（map）查询结果：将原始申请数据转换为页面所需的简洁格式
            projectName: a.projectName,  // 项目名称
            points: a.points || 0        // 获得的积分（默认 0）
        }));

        this.setData({ detail: details });
        // 更新页面数据：将处理后的明细列表更新到页面的 `detail`
      });


      // --- 步骤 4: 计算学院平均分与排名 ---
      db.collection('users').orderBy('totalPoints','desc').get().then(r=>{
      // 1. 查询 'users' 集合
      // 2. `.orderBy('totalPoints', 'desc')`：按总积分（`totalPoints`）降序排列，为计算排名做准备
        const list = r.data;

        // 计算平均分
        const avg = list.reduce((s,i)=>s+(i.totalPoints||0),0)/Math.max(1,list.length);

        // 使用 `.findIndex()` 找到当前用户在按积分降序排列的列表中的索引位置
        // 索引从 0 开始，所以需要 + 1 才是实际排名（1 代表第一名）
        const rank = list.findIndex(x => x._openid === openid) + 1;
        this.setData({ 
            averagePoints: Math.round(avg), // 更新平均分，并四舍五入取整
            rank: rank || '-'          // 更新排名，如果找不到排名（返回 0），则显示 '-'
        });

      });
    });
  }
});
