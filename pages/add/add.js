const categoryService = require('../../services/category')
const expenseService = require('../../services/expense')
const { formatDate, formatMoney } = require('../../utils/format')

Page({
  data: {
    editingId: null,
    amount: '',
    note: '',
    spentAt: '',
    categories: [],
    selectedCategoryId: null
  },

  onLoad() {
    this.setData({ spentAt: formatDate(new Date()) })
  },

  onShow() {
    const app = getApp()
    const editId = app.globalData.editExpenseId
    app.globalData.editExpenseId = null
    this.editingId = editId || null
    this.setData({ editingId: this.editingId })
    if (!this.editingId) {
      // 从 tab 进入「记一笔」时重置为新建态
      this.setData({
        amount: '',
        note: '',
        spentAt: formatDate(new Date())
      })
    }
    this.bootstrap()
  },

  async ensureDb() {
    await getApp().whenDbReady()
  },

  async bootstrap() {
    try {
      await this.ensureDb()
      const categories = categoryService.listCategories()
      let selectedCategoryId = this.data.selectedCategoryId
      if (!selectedCategoryId && categories.length) {
        selectedCategoryId = categories[0].id
      }

      if (this.editingId) {
        const expense = expenseService.getExpense(this.editingId)
        if (!expense) {
          wx.showToast({ title: '账单不存在', icon: 'none' })
          this.editingId = null
          this.setData({
            editingId: null,
            categories,
            selectedCategoryId
          })
          return
        }
        this.setData({
          categories,
          selectedCategoryId: expense.category_id,
          amount: formatMoney(expense.amount),
          note: expense.note || '',
          spentAt: expense.spent_at,
          editingId: expense.id
        })
        wx.setNavigationBarTitle({ title: '编辑账单' })
      } else {
        this.setData({ categories, selectedCategoryId })
        wx.setNavigationBarTitle({ title: '记一笔' })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ spentAt: e.detail.value })
  },

  onSelectCategory(e) {
    this.setData({ selectedCategoryId: Number(e.currentTarget.dataset.id) })
  },

  async onSubmit() {
    try {
      await this.ensureDb()
      const payload = {
        categoryId: this.data.selectedCategoryId,
        amount: this.data.amount,
        note: this.data.note,
        spentAt: this.data.spentAt
      }
      if (this.editingId) {
        expenseService.updateExpense(this.editingId, payload)
        wx.showToast({ title: '已保存' })
      } else {
        expenseService.createExpense(payload)
        wx.showToast({ title: '记账成功' })
        this.setData({ amount: '', note: '' })
      }
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 400)
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  onDelete() {
    if (!this.editingId) return
    wx.showModal({
      title: '删除账单',
      content: '确定删除这笔消费吗？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await this.ensureDb()
          expenseService.deleteExpense(this.editingId)
          wx.showToast({ title: '已删除' })
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 400)
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      }
    })
  }
})
