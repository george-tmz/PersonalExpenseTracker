const categoryService = require('../../services/category')
const { ICON_OPTIONS, COLOR_OPTIONS, iconText } = require('../../utils/icons')

Page({
  data: {
    id: null,
    name: '',
    icon: 'custom',
    color: '#0F766E',
    iconOptions: ICON_OPTIONS,
    colorOptions: COLOR_OPTIONS,
    previewText: '自'
  },

  onLoad(query) {
    this.categoryId = query.id ? Number(query.id) : null
    this.setData({ id: this.categoryId })
    wx.setNavigationBarTitle({
      title: this.categoryId ? '编辑消费项' : '新增消费项'
    })
  },

  onShow() {
    this.bootstrap()
  },

  async bootstrap() {
    if (!this.categoryId) {
      this.setData({ previewText: iconText(this.data.icon) })
      return
    }
    try {
      await getApp().whenDbReady()
      const item = categoryService.getCategory(this.categoryId)
      if (!item) {
        wx.showToast({ title: '消费项不存在', icon: 'none' })
        return
      }
      this.setData({
        name: item.name,
        icon: item.icon,
        color: item.color,
        previewText: item.iconText
      })
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onSelectIcon(e) {
    const icon = e.currentTarget.dataset.value
    this.setData({ icon, previewText: iconText(icon) })
  },

  onSelectColor(e) {
    this.setData({ color: e.currentTarget.dataset.value })
  },

  async onSave() {
    try {
      await getApp().whenDbReady()
      const payload = {
        name: this.data.name,
        icon: this.data.icon,
        color: this.data.color
      }
      if (this.categoryId) {
        categoryService.updateCategory(this.categoryId, payload)
      } else {
        categoryService.createCategory(payload)
      }
      wx.showToast({ title: '已保存' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  onDelete() {
    if (!this.categoryId) return
    wx.showModal({
      title: '删除消费项',
      content: '删除后不可恢复。若该消费项下仍有账单将无法删除。',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await getApp().whenDbReady()
          categoryService.deleteCategory(this.categoryId)
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.navigateBack(), 400)
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
