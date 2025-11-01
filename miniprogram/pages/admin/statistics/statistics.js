import * as echarts from '../../../components/ec-canvas/echarts';

Page({
  data: {
    summary: {
      totalApplications: 0,
      approvedCount: 0,
      rejectedCount: 0,
      approvalRate: 0,
      rejectRate: 0,
      applicationRise: 0,
      range: '最近30天'
    },
    filters: {
      dateIndex: 0,
      categoryIndex: 0
    },
    filterOptions: {
      dateRanges: ['最近7天', '最近30天', '本学期', '本年'],
      categories: [{ label: '全部类别', value: '' }]
    },
    trendChart: { lazyLoad: true },
    pieChart: { lazyLoad: true },
    trendData: [],
    pieData: [],
    logs: []
  },

  onLoad() {
    this.loadCategories();
    this.loadStatistics();
  },

  onPullDownRefresh() {
    Promise.all([this.loadCategories(), this.loadStatistics()])
      .finally(() => wx.stopPullDownRefresh());
  },

  async loadCategories() {
    try {
      const res = await wx.cloud.callFunction({ name: 'adminCategoryList' });
      const list = (res.result || []).map(item => ({
        label: item,
        value: item
      }));
      this.setData({
        'filterOptions.categories': [{ label: '全部类别', value: '' }].concat(list)
      });
    } catch (err) {
      console.error('加载类别失败', err);
    }
  },

  async loadStatistics() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const { filterOptions, filters } = this.data;
      const payload = {
        range: filterOptions.dateRanges[filters.dateIndex],
        category: filterOptions.categories[filters.categoryIndex]?.value || ''
      };
      const res = await wx.cloud.callFunction({
        name: 'adminStatistics',
        data: payload
      });
      const result = res.result || {};
      this.setData({
        summary: {
          totalApplications: result.summary?.totalApplications || 0,
          approvedCount: result.summary?.approvedCount || 0,
          rejectedCount: result.summary?.rejectedCount || 0,
          approvalRate: (result.summary?.approvalRate || 0).toFixed(1),
          rejectRate: (result.summary?.rejectRate || 0).toFixed(1),
          applicationRise: (result.summary?.applicationRise || 0).toFixed(1),
          range: result.summary?.range || payload.range
        },
        trendData: result.trend || [],
        pieData: result.pie || [],
        logs: (result.logs || []).map(item => ({
          id: item._id,
          adminName: item.adminName || '',
          projectName: item.projectName || '',
          actionText: this.formatActionText(item.action),
          time: item.createTime ? new Date(item.createTime).toLocaleString() : ''
        }))
      }, () => {
        this.initTrendChart();
        this.initPieChart();
      });
    } catch (err) {
      console.error('统计数据加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDateRangeChange(e) {
    this.setData({ 'filters.dateIndex': Number(e.detail.value) || 0 }, () => {
      this.loadStatistics();
    });
  },

  onCategoryChange(e) {
    this.setData({ 'filters.categoryIndex': Number(e.detail.value) || 0 }, () => {
      this.loadStatistics();
    });
  },

  async exportData() {
    wx.showLoading({ title: '生成中', mask: true });
    try {
      const { filterOptions, filters } = this.data;
      const payload = {
        range: filterOptions.dateRanges[filters.dateIndex],
        category: filterOptions.categories[filters.categoryIndex]?.value || ''
      };
      const res = await wx.cloud.callFunction({
        name: 'adminStatisticsExport',
        data: payload
      });
      if (res.result?.fileID) {
        const downloadRes = await wx.cloud.downloadFile({
          fileID: res.result.fileID
        });
        wx.openDocument({
          filePath: downloadRes.tempFilePath,
          fileType: 'xlsx'
        });
      } else {
        wx.showToast({ title: '未生成文件', icon: 'none' });
      }
    } catch (err) {
      console.error('导出失败', err);
      wx.showToast({ title: '导出失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  formatActionText(action) {
    if (action === 'approved') return '通过申请';
    if (action === 'rejected') return '驳回申请';
    if (action === 'created') return '创建项目';
    return action || '操作';
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

  getTrendOption() {
    const data = this.data.trendData || [];
    const days = data.map(item => item.date);
    const pending = data.map(item => item.pending || 0);
    const approved = data.map(item => item.approved || 0);
    const rejected = data.map(item => item.rejected || 0);

    return {
      color: ['#2f6fd2', '#2c9c5a', '#d94a4c'],
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['待审核', '已通过', '已驳回'],
        textStyle: { color: '#4f5e7f' }
      },
      grid: { left: 16, right: 16, top: 40, bottom: 24, containLabel: true },
      xAxis: {
        type: 'category',
        data: days,
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#8c9abc' } }
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#8c9abc' } },
        splitLine: { lineStyle: { color: 'rgba(140,154,188,0.2)' } }
      },
      series: [
        { name: '待审核', type: 'line', smooth: true, data: pending },
        { name: '已通过', type: 'line', smooth: true, data: approved },
        { name: '已驳回', type: 'line', smooth: true, data: rejected }
      ]
    };
  },

  initPieChart() {
    if (!this.pieComponent) {
      this.pieComponent = this.selectComponent('#pieChart');
    }
    if (!this.pieComponent) return;

    this.pieComponent.init((canvas, width, height, dpr) => {
      const chart = echarts.init(canvas, null, {
        width,
        height,
        devicePixelRatio: dpr
      });
      canvas.setChart(chart);
      chart.setOption(this.getPieOption());
      this.pieChartInstance = chart;
      return chart;
    });
  },

  getPieOption() {
    const data = this.data.pieData || [];
    return {
      color: ['#2f6fd2', '#2c9c5a', '#d94a4c', '#7d60d4', '#ffaf3c'],
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '50%'],
        label: {
          color: '#2f3f64',
          formatter: '{b}\n{d}%'
        },
        labelLine: { smooth: true },
        data: data.map(item => ({
          value: item.count,
          name: item.project
        }))
      }]
    };
  }
});