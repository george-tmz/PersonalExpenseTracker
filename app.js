const db = require('./utils/db')

App({
  globalData: {
    dbReady: false,
    editExpenseId: null
  },

  onLaunch() {
    this.dbReadyPromise = db
      .init()
      .then(() => {
        this.globalData.dbReady = true
      })
      .catch((err) => {
        console.error('数据库初始化失败', err)
        wx.showToast({
          title: '数据库初始化失败',
          icon: 'none'
        })
        throw err
      })
  },

  whenDbReady() {
    return this.dbReadyPromise || db.init()
  }
})
