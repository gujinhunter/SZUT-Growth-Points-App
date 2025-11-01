import * as echarts from '../../../components/ec-canvas/echarts'; // 根据实际路径调整

const db = wx.cloud.database();

Page({
  data: {
    adminName: '',
    today: '',
    metrics: {
      pendingToday: 0,
      totalProjects: 0,
      approvalRate: 0
    },
    categoryFilters: [
      { label: '全部类别', value: '', active: true }
    ],
    trendChart: {
      lazyLoad: true
    },
    rankChart: {
      lazyLoad: true
    },
    trendData: null,
    rankData: null
  },

  onLoad() {
    this.setData({
      today: this.formatDate(new Date())
    });
    this.ensureAdminName();
    this.loadOverview();
    this.loadCategories();
  },

  onShow() {
    // 返回首页时可刷新概览
    this.loadOverview();
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadOverview(),
      this.loadCategories()
    ]).finally(() => wx.stopPullDownRefresh());
  },

  async ensureAdminName() {
    try {
      const res = await wx.cloud.callFunction({ name: 'getAdminProfile' });
      this.setData({ adminName: res.result?.name || '管理员' });
    } catch (err) {
      console.warn('获取管理员信息失败', err);
    }
  },

  async loadOverview() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const res = await wx.cloud.callFunction({ name: 'adminOverview' });
      const data = res.result || {};
      this.setData({
        metrics: {
          pendingToday: data.pendingToday || 0,
          totalProjects: data.totalProjects || 0,
          approvalRate: (data.approvalRate || 0).toFixed(1)
        },
        trendData: data.trend || [],
        rankData: data.rank || []
      }, () => {
        this.initTrendChart();
        this.initRankChart();
      });
    } catch (err) {
      console.error('概览数据加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadCategories() {
    try {
      const res = await db.collection('projects')
        .field({ category: true })
        .get();
      const exists = new Set();
      res.data.forEach(item => {
        if (item.category) exists.add(item.category);
      });
      const list = Array.from(exists).map(text => ({
        label: text,
        value: text,
        active: false
      }));
      this.setData({
        categoryFilters: [
          { label: '全部类别', value: '', active: true },
          ...list
        ]
      });
    } catch (err) {
      console.error('加载类别失败', err);
    }
  },

  handleCategoryTap(e) {
    const value = e.currentTarget.dataset.value;
    const updated = this.data.categoryFilters.map(item => ({
      ...item,
      active: item.value === value
    }));
    this.setData({ categoryFilters: updated });
    const url = value
      ? `/pages/admin/review/review?category=${encodeURIComponent(value)}`
      : '/pages/admin/review/review';
    wx.navigateTo({ url });
  },

  goPage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (url.startsWith('/pages/admin/review') || url.startsWith('/pages/admin/statistics')) {
      wx.navigateTo({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  initTrendChart() {
    if (!this.trendComponent) {
      this.trendComponent = this.selectComponent('#trendChart');
    }
    if (!this.trendComponent) return;

    this.trendComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width,
        height,
        devicePixelRatio: dpr
      });
      canvas.setChart(chart);
      chart.setOption(this.getTrendOption());
      this.trendChartInstance = chart;
      return chart;
    });
  },

  initRankChart() {
    if (!this.rankComponent) {
      this.rankComponent = this.selectComponent('#rankChart');
    }
    if (!this.rankComponent) return;

    this.rankComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width,
        height,
        devicePixelRatio: dpr
      });
      canvas.setChart(chart);
      chart.setOption(this.getRankOption());
      this.rankChartInstance = chart;
      return chart;
    });
  },

  getTrendOption() {
    const data = this.data.trendData || [];
    const days = data.map(item => item.date);
    const counts = data.map(item => item.count);

    return {
      color: ['#2f6fd2'],
      grid: { left: 14, right: 10, top: 34, bottom: 26, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: days,
        axisLine: { lineStyle: { color: '#8c9abc' } }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#8c9abc' } },
        splitLine: { lineStyle: { color: 'rgba(140,154,188,0.2)' } }
      },
      series: [{
        name: '审核量',
        type: 'line',
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(47, 111, 210, 0.35)' },
            { offset: 1, color: 'rgba(47, 111, 210, 0.02)' }
          ])
        },
        data: counts
      }]
    };
  },

  getRankOption() {
    const data = (this.data.rankData || []).slice(0, 5);
    const names = data.map(item => item.project);
    const counts = data.map(item => item.count);

    return {
      color: ['#1f4e9d'],
      grid: { left: 90, right: 30, top: 24, bottom: 26 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#8c9abc' } },
        splitLine: { lineStyle: { color: 'rgba(140,154,188,0.2)' } }
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: names,
        axisLine: { lineStyle: { color: '#8c9abc' } }
      },
      series: [{
        name: '申请量',
        type: 'bar',
        barWidth: 16,
        itemStyle: {
          borderRadius: [0, 8, 8, 0]
        },
        data: counts
      }]
    };
  },

  formatDate(date) {
    const yyyy = date.getFullYear();
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
});