// miniprogram/pages/admin/review.js
const db = wx.cloud.database();
const _ = db.command;

Page({
  data: {
    applications: [],
    loading: true
  },

  onLoad() {
    this.loadApplications();
  },

  // 加载待审核申请
  loadApplications() {
    this.setData({ loading: true });

    db.collection('applications')
      .orderBy('createTime', 'desc')
      .get()
      .then(res => {
        const apps = (res.data || []).map(item => {
          return {
            ...item,
            createTimeFormatted: item.createTime ? new Date(item.createTime).toLocaleString() : '',
            statusClass: (item.status === '已通过' ? 'approved' : (item.status === '已驳回' ? 'rejected' : 'pending'))
          };
        });
        this.setData({ applications: apps, loading: false });
      })
      .catch(err => {
        console.error('加载申请失败', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
        this.setData({ loading: false });
      });
  },

  // 预览附件
  previewFile(e) {
    const fileID = e.currentTarget.dataset.fileid;
    if (!fileID) {
      wx.showToast({ title: '无附件', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '打开文件...' });
    wx.cloud.downloadFile({
      fileID
    }).then(res => {
      wx.hideLoading();
      wx.openDocument({
        filePath: res.tempFilePath,
        success() {},
        fail() {
          wx.showToast({ title: '打开失败', icon: 'none' });
        }
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '下载失败', icon: 'none' });
      console.error(err);
    });
  },

  // 审核：通过
  async handleApprove(e) {
    const appId = e.currentTarget.dataset.id;
    const projectId = e.currentTarget.dataset.projectid;

    if (!appId) return;
    wx.showModal({
      title: '确认通过',
      content: '确认将该申请设置为“已通过”并发放积分吗？',
      success: async (res) => {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中...' });

        try {
          // 1) 更新 application 的状态为已通过
          await db.collection('applications').doc(appId).update({
            data: {
              status: 'approved',
              reviewTime: new Date()
            }
          });

          // 2) 获取申请记录（更新后的），以便拿 openid
          const { data: [appDoc] } = await db.collection('applications').where({_id: appId}).get();
          const openid = appDoc._openid;

          // 3) 尝试读取项目设置中的积分（如果有 projectId）
          let pointValue = 0;
          if (projectId) {
            const prRes = await db.collection('activities').doc(projectId).get().catch(()=> null);
            if (prRes && prRes.data) {
              const scoreField = prRes.data.score;
              if (Array.isArray(scoreField)) {
                // 若是数组，取第一个（你可以改成其它逻辑）
                pointValue = Number(scoreField[0]) || 0;
              } else {
                pointValue = Number(scoreField) || 0;
              }
            }
          }

          // 4) 给用户加分：users 集合（若无创建），并写入积分记录 points_records
          // 更新或创建 users 文档
          const usersCol = db.collection('users');
          const userQuery = await usersCol.where({ _openid: openid }).get();
          if (userQuery.data && userQuery.data.length > 0) {
            const userDoc = userQuery.data[0];
            await usersCol.doc(userDoc._id).update({
              data: {
                points: _.inc(pointValue)
              }
            });
          } else {
            // 创建用户文档（若你不想在这里创建可删除此分支）
            await usersCol.add({
              data: {
                _openid: openid,
                points: pointValue,
                createdAt: new Date()
              }
            });
          }

          // 写入积分明细集合
          await db.collection('points_records').add({
            data: {
              _openid: openid,
              projectId: projectId || null,
              projectName: appDoc.projectName || '',
              points: pointValue,
              type: '审核通过',
              createTime: new Date(),
              applicationId: appId
            }
          });

          wx.hideLoading();
          wx.showToast({ title: '已通过并发放积分', icon: 'success' });

          // 刷新列表
          this.loadApplications();
        } catch (err) {
          console.error('handleApprove error', err);
          wx.hideLoading();
          wx.showToast({ title: '处理失败', icon: 'none' });
        }
      }
    });
  },

  // 审核：驳回
  handleReject(e) {
    const appId = e.currentTarget.dataset.id;
    if (!appId) return;

    wx.showModal({
      title: '确认驳回',
      content: '确认将该申请设置为“已驳回”？',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        db.collection('applications').doc(appId).update({
          data: {
            status: '已驳回',
            reviewTime: new Date()
          }
        }).then(() => {
          wx.hideLoading();
          wx.showToast({ title: '已驳回', icon: 'success' });
          this.loadApplications();
        }).catch(err => {
          console.error('驳回失败', err);
          wx.hideLoading();
          wx.showToast({ title: '驳回失败', icon: 'none' });
        });
      }
    });
  }
});
