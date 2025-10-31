import * as echarts from '../../ec-canvas/echarts'; // 需要在项目中添加 ec-canvas 组件文件

const db = wx.cloud.database();

Page({
  data: {
    totalApplications: 0,
    approved: 0,
    rejected: 0,
    ec: { lazyLoad: true },
    ec2: { lazyLoad: true }
  },

  onLoad() {
    this.loadData();
  },

  async loadData() {
    const apps = await db.collection('applications').get();
    const total = apps.data.length;
    const approved = apps.data.filter(a => a.status === '已通过').length;
    const rejected = apps.data.filter(a => a.status === '已驳回').length;

    this.setData({ totalApplications: total, approved, rejected });

    // 分类统计
    const categoryCount = {};
    apps.data.forEach(a => {
      categoryCount[a.category || '未分类'] = (categoryCount[a.category || '未分类'] || 0) + 1;
    });

    const catNames = Object.keys(categoryCount);
    const catValues = Object.values(categoryCount);

    // 积分分布统计
    const scoreRange = { '0-5': 0, '6-10': 0, '11-20': 0, '21以上': 0 };
    apps.data.forEach(a => {
      const s = Number(a.score || 0);
      if (s <= 5) scoreRange['0-5']++;
      else if (s <= 10) scoreRange['6-10']++;
      else if (s <= 20) scoreRange['11-20']++;
      else scoreRange['21以上']++;
    });

    this.initCategoryChart(catNames, catValues);
    this.initScoreChart(Object.keys(scoreRange), Object.values(scoreRange));
  },

  initCategoryChart(names, values) {
    this.selectComponent('#categoryChart').init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr });
      const option = {
        tooltip: {},
        xAxis: { type: 'category', data: names },
        yAxis: { type: 'value' },
        series: [{ data: values, type: 'bar', itemStyle: { color: '#ff6b81' } }]
      };
      chart.setOption(option);
      return chart;
    });
  },

  initScoreChart(names, values) {
    this.selectComponent('#scoreChart').init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, { width, height, devicePixelRatio: dpr });
      const option = {
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            label: { show: false },
            data: names.map((n, i) => ({ name: n, value: values[i] }))
          }
        ]
      };
      chart.setOption(option);
      return chart;
    });
  }
});
