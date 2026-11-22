const statsService = require('../../services/stats')
const categoryService = require('../../services/category')
const { formatDate } = require('../../utils/format')

const DIMENSIONS = [
  { value: 'day', label: '天' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' }
]

Page({
  data: {
    dimensions: DIMENSIONS,
    dimension: 'month',
    anchor: '',
    report: {
      range: { label: '' },
      summary: { totalText: '0.00', count: 0 },
      categories: [],
      trend: []
    },
    chartMinWidth: '100%',
    categoryOptions: [],
    categoryIndex: 0,
    selectedCategoryId: null,
    categoryReport: null
  },

  onShow() {
    if (!this.data.anchor) {
      this.setData({ anchor: formatDate(new Date()) })
    }
    this.refresh()
  },

  async ensureDb() {
    await getApp().whenDbReady()
  },

  async refresh() {
    try {
      await this.ensureDb()
      const report = statsService.buildReport(this.data.dimension, this.data.anchor)
      const chartMinWidth =
        report.trend.length > 10 ? `${report.trend.length * 56}rpx` : '100%'

      const categories = categoryService.listCategories()
      const categoryOptions = [{ id: null, name: '全部消费项' }].concat(categories)

      let categoryReport = null
      let categoryIndex = 0
      if (this.data.selectedCategoryId) {
        categoryIndex = categoryOptions.findIndex(
          (c) => c.id === this.data.selectedCategoryId
        )
        if (categoryIndex < 0) {
          categoryIndex = 0
          this.setData({ selectedCategoryId: null })
        } else {
          categoryReport = statsService.categoryReport(
            this.data.selectedCategoryId,
            this.data.dimension,
            this.data.anchor
          )
        }
      }

      this.setData({
        report,
        chartMinWidth,
        categoryOptions,
        categoryIndex,
        categoryReport
      })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  onSwitchDimension(e) {
    const dimension = e.currentTarget.dataset.value
    this.setData({ dimension }, () => this.refresh())
  },

  onPrev() {
    const anchor = statsService.shiftAnchor(this.data.dimension, this.data.anchor, -1)
    this.setData({ anchor }, () => this.refresh())
  },

  onNext() {
    const anchor = statsService.shiftAnchor(this.data.dimension, this.data.anchor, 1)
    this.setData({ anchor }, () => this.refresh())
  },

  onPickCategory(e) {
    const index = Number(e.detail.value)
    const option = this.data.categoryOptions[index]
    this.setData(
      {
        categoryIndex: index,
        selectedCategoryId: option && option.id ? option.id : null
      },
      () => this.refresh()
    )
  },

  onClearCategory() {
    this.setData({ selectedCategoryId: null, categoryIndex: 0 }, () => this.refresh())
  }
})
