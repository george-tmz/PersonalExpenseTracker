/**
 * 本地 SQLite 数据库封装（基于 sql.js）
 * 持久化文件：wx.env.USER_DATA_PATH/expense.sqlite
 */

const DB_FILE = 'expense.sqlite'

const PRESET_CATEGORIES = [
  { name: '餐饮', icon: 'food', color: '#F97316', sort_order: 1 },
  { name: '交通', icon: 'transport', color: '#0EA5E9', sort_order: 2 },
  { name: '购物', icon: 'shopping', color: '#EC4899', sort_order: 3 },
  { name: '居住', icon: 'home', color: '#8B5CF6', sort_order: 4 },
  { name: '娱乐', icon: 'fun', color: '#14B8A6', sort_order: 5 },
  { name: '医疗', icon: 'medical', color: '#EF4444', sort_order: 6 },
  { name: '教育', icon: 'edu', color: '#3B82F6', sort_order: 7 },
  { name: '其他', icon: 'other', color: '#6B7280', sort_order: 8 }
]

let SQL = null
let db = null
let readyPromise = null
let persistTimer = null

function getUserDataPath() {
  // 微信文档：本地用户文件目录通过 wx.env.USER_DATA_PATH 获取
  const env = (typeof wx !== 'undefined' && wx.env) || {}
  const base = env.USER_DATA_PATH
  if (typeof base !== 'string' || !base) {
    throw new Error(
      '无法获取用户文件目录（wx.env.USER_DATA_PATH 无效），请确认在微信小程序环境运行'
    )
  }
  return base
}

function getDbPath() {
  return `${getUserDataPath()}/${DB_FILE}`
}

function ensureGlobals() {
  // sql.js 在小程序环境需要少量全局垫片
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis
  }
  if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis
  }
}

function loadSqlEngine() {
  ensureGlobals()
  // eslint-disable-next-line import/no-unresolved
  const initSqlJs = require('./sql-asm.js')
  return initSqlJs({
    locateFile: () => ''
  })
}

function readFileBuffer(filePath) {
  return new Promise((resolve) => {
    if (typeof filePath !== 'string' || !filePath) {
      resolve(null)
      return
    }
    const fs = wx.getFileSystemManager()
    // access 参数名为 path；readFile / writeFile 参数名为 filePath
    fs.access({
      path: filePath,
      success() {
        fs.readFile({
          filePath,
          success: (res) => resolve(res.data),
          fail: () => resolve(null)
        })
      },
      fail() {
        resolve(null)
      }
    })
  })
}

function writeFileBuffer(filePath, data) {
  return new Promise((resolve, reject) => {
    if (typeof filePath !== 'string' || !filePath) {
      reject(
        new Error(
          'writeFile: filePath 无效（应为字符串）。请检查 wx.env.USER_DATA_PATH'
        )
      )
      return
    }
    const fs = wx.getFileSystemManager()
    fs.writeFile({
      filePath,
      data,
      success: resolve,
      fail: reject
    })
  })
}

function createSchema(database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT 'other',
      color TEXT NOT NULL DEFAULT '#0F766E',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_preset INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      note TEXT NOT NULL DEFAULT '',
      spent_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );
  `)

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses(spent_at);
  `)
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
  `)
}

function seedPresets(database) {
  const row = database.exec('SELECT COUNT(*) AS c FROM categories')
  const count = row.length ? row[0].values[0][0] : 0
  if (count > 0) return

  const stmt = database.prepare(`
    INSERT INTO categories (name, icon, color, sort_order, is_preset)
    VALUES (?, ?, ?, ?, 1)
  `)
  PRESET_CATEGORIES.forEach((item) => {
    stmt.run([item.name, item.icon, item.color, item.sort_order])
  })
  stmt.free()
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persist().catch((err) => console.error('持久化失败', err))
  }, 80)
}

function persist() {
  if (!db) return Promise.resolve()
  const data = db.export()
  // sql.js 返回 Uint8Array；小程序 writeFile 可写 ArrayBuffer
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  return writeFileBuffer(getDbPath(), buffer)
}

function rowsFromExec(result) {
  if (!result || !result.length) return []
  const { columns, values } = result[0]
  return values.map((row) => {
    const obj = {}
    columns.forEach((col, idx) => {
      obj[col] = row[idx]
    })
    return obj
  })
}

function run(sql, params = []) {
  if (!db) throw new Error('数据库尚未初始化')
  db.run(sql, params)
  schedulePersist()
}

function exec(sql) {
  if (!db) throw new Error('数据库尚未初始化')
  return db.exec(sql)
}

function all(sql, params = []) {
  if (!db) throw new Error('数据库尚未初始化')
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function get(sql, params = []) {
  const rows = all(sql, params)
  return rows[0] || null
}

function init() {
  if (readyPromise) return readyPromise

  readyPromise = loadSqlEngine()
    .then((engine) => {
      SQL = engine
      return readFileBuffer(getDbPath())
    })
    .then((fileData) => {
      if (fileData) {
        const u8 =
          fileData instanceof ArrayBuffer
            ? new Uint8Array(fileData)
            : new Uint8Array(fileData)
        db = new SQL.Database(u8)
      } else {
        db = new SQL.Database()
      }
      createSchema(db)
      seedPresets(db)
      return persist()
    })
    .then(() => db)

  return readyPromise
}

function getDatabase() {
  return db
}

module.exports = {
  PRESET_CATEGORIES,
  init,
  persist,
  run,
  exec,
  all,
  get,
  getDatabase,
  rowsFromExec
}
