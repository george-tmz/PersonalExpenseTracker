/**
 * 在 Node 中模拟微信文件 API，验证 SQLite 业务逻辑；
 * 并扫描小程序源码确保无 Node 内置模块静态依赖。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-db-'))
const dbFile = path.join(tmpDir, 'expense.minidb')

function assertNoNodeBuiltinDeps() {
  const root = path.join(__dirname, '..')
  const skip = new Set([
    path.join(root, 'scripts'),
    path.join(root, 'node_modules'),
    path.join(root, '.git')
  ])
  const offenders = []
  const re = /require\s*\(\s*['"](?:fs|path|crypto)['"]\s*\)|from\s+['"](?:fs|path|crypto)['"]|import\s*\(\s*['"](?:fs|path|crypto)['"]\s*\)/

  function walk(dir) {
    if (skip.has(dir)) return
    fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'scripts') return
        walk(full)
        return
      }
      if (!/\.(js|json|wxs)$/.test(ent.name)) return
      if (ent.name === 'sql-asm.js') {
        offenders.push(`${full} (不应再存在 sql-asm.js)`)
        return
      }
      const text = fs.readFileSync(full, 'utf8')
      if (re.test(text)) offenders.push(full)
    })
  }

  walk(root)
  if (offenders.length) {
    throw new Error(`发现 Node 内置依赖或遗留 sql-asm:\n${offenders.join('\n')}`)
  }
}

global.wx = {
  env: { USER_DATA_PATH: tmpDir },
  getFileSystemManager() {
    return {
      access({ path: p, success, fail }) {
        if (typeof p !== 'string') {
          fail({ errMsg: 'access:fail parameter error: path should be String' })
          return
        }
        if (fs.existsSync(p)) success()
        else fail({ errMsg: 'access:fail' })
      },
      readFile({ filePath, success, fail }) {
        if (typeof filePath !== 'string') {
          fail({
            errMsg:
              'readFile:fail parameter error: parameter.filePath should be String instead of Undefined;'
          })
          return
        }
        try {
          success({ data: fs.readFileSync(filePath) })
        } catch (err) {
          fail(err)
        }
      },
      writeFile({ filePath, success, fail, data }) {
        if (typeof filePath !== 'string') {
          fail({
            errno: 1001,
            errMsg:
              'writeFile:fail parameter error: parameter.filePath should be String instead of Undefined;'
          })
          return
        }
        try {
          const buf = Buffer.isBuffer(data)
            ? data
            : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data)
          fs.writeFileSync(filePath, buf)
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
  assertNoNodeBuiltinDeps()

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

  const list = expenseService.listExpensesByDate('2026-11-22')
  if (list.length !== 2) throw new Error(`日明细笔数错误: ${list.length}`)
  if (!list[0].category_name) throw new Error('JOIN 未返回 category_name')

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
  if (yearReport.trend.length !== 12) {
    throw new Error(`年趋势应有 12 个月，实际 ${yearReport.trend.length}`)
  }

  categoryService.updateCategory(custom.id, {
    name: '手冲咖啡',
    icon: 'fun',
    color: '#EA580C'
  })

  await db.persist()
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(`${path.sep}utils${path.sep}`) || key.includes(`${path.sep}services${path.sep}`)) {
      delete require.cache[key]
    }
  })

  const db2 = require('../utils/db')
  await db2.init()
  const expenseService2 = require('../services/expense')
  const again = expenseService2.sumByDate('2026-11-22')
  if (Math.abs(again.total - 35.5) > 0.001) {
    throw new Error('持久化后数据丢失')
  }

  if (!fs.existsSync(dbFile)) throw new Error('未生成 minidb 文件')

  console.log('TEST_OK')
  console.log(
    JSON.stringify(
      {
        presets: cats.length,
        dayTotal: daySum.total,
        monthTotal: monthReport.summary.total,
        categoryRows: monthReport.categories.length,
        dbFile,
        dbBytes: fs.statSync(dbFile).size,
        noSqlAsm: !fs.existsSync(path.join(__dirname, '../utils/sql-asm.js'))
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
