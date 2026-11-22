const expenseService = require('../../services/expense')
const { formatDate, weekdayName } = require('../../utils/format')

Page({
  data: {
    currentDate: '',
    weekday: '',
    isToday: true,
    summary: { totalText: '0.00', count: 0 },
    list: []
  },

  onShow() {
    if (!this.data.currentDate) {
      this.setDate(formatDate(new Date()))
    } else {
      this.refresh()
    }
  },

  async ensureDb() {
    const app = getApp()
    await app.whenDbReady()
  },

  setDate(date) {
    const today = formatDate(new Date())
    this.setData({
      currentDate: date,
      weekday: weekdayName(date),
      isToday: date === today
    })
    this.refresh()
  },

  async refresh() {
    try {
      await this.ensureDb()
      const list = expenseService.listExpensesByDate(this.data.currentDate)
      const summary = expenseService.sumByDate(this.data.currentDate)
      this.setData({ list, summary })
    } catch (err) {
      console.error(err)
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  onPrevDay() {
    const d = new Date(this.data.currentDate.replace(/-/g, '/'))
    d.setDate(d.getDate() - 1)
    this.setDate(formatDate(d))
  },

  onNextDay() {
    const d = new Date(this.data.currentDate.replace(/-/g, '/'))
    d.setDate(d.getDate() + 1)
    this.setDate(formatDate(d))
  },

  onPickDate(e) {
    this.setDate(e.detail.value)
  },

  onGoToday() {
    this.setDate(formatDate(new Date()))
  },

  onEdit(e) {
    const { id } = e.currentTarget.dataset
    // tabBar 页面不能 navigateTo 传参，经由 globalData 交给记账页
    getApp().globalData.editExpenseId = Number(id)
    wx.switchTab({ url: '/pages/add/add' })
  },

  onDelete(e) {
    const { id } = e.currentTarget.dataset
    wx.showModal({
      title: '删除账单',
      content: '确定删除这笔消费吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await this.ensureDb()
          expenseService.deleteExpense(id)
          wx.showToast({ title: '已删除' })
          this.refresh()
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
