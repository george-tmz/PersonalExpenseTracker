/**
 * 在 Node 中模拟微信文件 API，验证 SQLite 业务逻辑。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-db-'))
const dbFile = path.join(tmpDir, 'expense.sqlite')

global.wx = {
  env: { USER_DATA_PATH: tmpDir },
  getFileSystemManager() {
    return {
      // 与微信 API 对齐：access 用 path；readFile/writeFile 用 filePath
      access({ path: p, success, fail }) {
        if (typeof p !== 'string') {
          fail({ errMsg: 'access:fail parameter error: path should be String' })
          return
        }
        if (fs.existsSync(p)) success()
        else fail({ errMsg: 'access:fail' })
      },
      readFile({ filePath, path: legacyPath, success, fail }) {
        const p = filePath
        if (typeof p !== 'string') {
          fail({
            errMsg:
              'readFile:fail parameter error: parameter.filePath should be String instead of Undefined;'
          })
          return
        }
        if (legacyPath && !filePath) {
          fail({ errMsg: 'readFile:fail unexpected legacy path key' })
          return
        }
        try {
          success({ data: fs.readFileSync(p) })
        } catch (err) {
          fail(err)
        }
      },
      writeFile({ filePath, path: legacyPath, success, fail, data }) {
        const p = filePath
        if (typeof p !== 'string') {
          fail({
            errno: 1001,
            errMsg:
              'writeFile:fail parameter error: parameter.filePath should be String instead of Undefined;'
          })
          return
        }
        if (legacyPath && !filePath) {
          fail({ errMsg: 'writeFile:fail unexpected legacy path key' })
          return
        }
        try {
          const buf = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)
          fs.writeFileSync(p, buf)
          success()
        } catch (err) {
          fail(err)
        }
      }
    }
  },
  showToast() {}
}

async function main() {
  const db = require('../utils/db')
  const categoryService = require('../services/category')
  const expenseService = require('../services/expense')
  const statsService = require('../services/stats')

  await db.init()

  const cats = categoryService.listCategories()
  if (cats.length < 8) throw new Error('预设分类数量不足')

  const custom = categoryService.createCategory({
    name: '咖啡',
    icon: 'fun',
    color: '#0F766E'
  })

  expenseService.createExpense({
    categoryId: cats[0].id,
    amount: 23.5,
    note: '午餐',
    spentAt: '2026-11-22'
  })
  expenseService.createExpense({
    categoryId: cats[1].id,
    amount: 12,
    note: '地铁',
    spentAt: '2026-11-22'
  })
  expenseService.createExpense({
    categoryId: custom.id,
    amount: 18,
    note: '拿铁',
    spentAt: '2026-11-21'
  })

  const daySum = expenseService.sumByDate('2026-11-22')
  if (Math.abs(daySum.total - 35.5) > 0.001) {
    throw new Error(`日合计错误: ${daySum.total}`)
  }

  const monthReport = statsService.buildReport('month', '2026-11-22')
  if (monthReport.summary.count !== 3) {
    throw new Error(`月报表笔数错误: ${monthReport.summary.count}`)
  }
  if (!monthReport.categories.length) {
    throw new Error('消费项报表为空')
  }

  const weekReport = statsService.buildReport('week', '2026-11-22')
  const yearReport = statsService.buildReport('year', '2026-11-22')
  if (!weekReport.range.label || !yearReport.trend.length) {
    throw new Error('周/年报表异常')
  }

  categoryService.updateCategory(custom.id, {
    name: '手冲咖啡',
    icon: 'fun',
    color: '#EA580C'
  })

  // 持久化后重新打开
  await db.persist()
  // 重置模块缓存，模拟冷启动
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(`${path.sep}utils${path.sep}`) || key.includes(`${path.sep}services${path.sep}`)) {
      delete require.cache[key]
    }
  })

  // 重新打补丁 wx 后再 require
  const db2 = require('../utils/db')
  await db2.init()
  const expenseService2 = require('../services/expense')
  const again = expenseService2.sumByDate('2026-11-22')
  if (Math.abs(again.total - 35.5) > 0.001) {
    throw new Error('持久化后数据丢失')
  }

  if (!fs.existsSync(dbFile)) throw new Error('未生成 sqlite 文件')

  // 回归：模拟误用 path 而非 filePath 时应报与开发者工具一致的错误
  await new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      path: dbFile,
      data: Buffer.from('x'),
      success: () => reject(new Error('误用 path 不应成功')),
      fail: (err) => {
        if (!err || !/filePath should be String/.test(err.errMsg || '')) {
          reject(new Error(`期望 filePath 参数错误，实际: ${JSON.stringify(err)}`))
          return
        }
        resolve()
      }
    })
  })

  console.log('TEST_OK')
  console.log(
    JSON.stringify(
      {
        presets: cats.length,
        dayTotal: daySum.total,
        monthTotal: monthReport.summary.total,
        categoryRows: monthReport.categories.length,
        dbFile,
        dbBytes: fs.statSync(dbFile).size
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
