const categoryService = require('../../services/category')

Page({
  data: {
    list: []
  },

  onShow() {
    this.refresh()
  },

  async refresh() {
    try {
      await getApp().whenDbReady()
      this.setData({ list: categoryService.listCategories() })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/category-edit/category-edit' })
  },

  onEdit(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: `/pages/category-edit/category-edit?id=${id}` })
  }
})
