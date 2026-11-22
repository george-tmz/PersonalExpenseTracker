/**
 * 微信小程序专用迷你 SQLite 兼容引擎（纯 JS）
 * - 无 Node 内置模块依赖（无 fs/path/crypto require/import）
 * - 覆盖本项目 SQL 子集；export 为 JSON Uint8Array
 */

const MAGIC = 'PETSQL1'

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`
}

function nowLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function encodeUtf8(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str)
  const out = []
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i)
    if (c < 0x80) out.push(c)
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return Uint8Array.from(out)
}

function decodeUtf8(u8) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8)
  let out = ''
  for (let i = 0; i < u8.length; i += 1) out += String.fromCharCode(u8[i])
  return out
}

function normalizeSql(sql) {
  return String(sql || '')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitStatements(sql) {
  return normalizeSql(sql)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

function splitTop(list, sep) {
  const args = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i]
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (depth === 0 && list.slice(i, i + sep.length).toUpperCase() === sep.toUpperCase()) {
      args.push(cur.trim())
      cur = ''
      i += sep.length - 1
      continue
    }
    cur += ch
  }
  if (cur.trim()) args.push(cur.trim())
  return args
}

function splitArgs(list) {
  return splitTop(list, ',')
}

function countPlaceholders(expr) {
  return (String(expr).match(/\?/g) || []).length
}

function parseDefault(raw) {
  const s = String(raw || '').trim()
  if (/^datetime\('now',\s*'localtime'\)$/i.test(s)) return { kind: 'now' }
  if (/^'.*'$/.test(s) || /^".*"$/.test(s)) return { kind: 'lit', value: s.slice(1, -1) }
  if (/^-?\d+(\.\d+)?$/.test(s)) return { kind: 'lit', value: Number(s) }
  return { kind: 'lit', value: s }
}

function getField(row, name) {
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name]
  const bare = name.includes('.') ? name.split('.').pop() : name
  if (Object.prototype.hasOwnProperty.call(row, bare)) return row[bare]
  return undefined
}

function evalAtom(expr, row, params, state) {
  const e = String(expr || '').trim()
  if (e === '?') {
    const v = params[state.i]
    state.i += 1
    return v
  }
  if (/^null$/i.test(e)) return null
  if (/^'.*'$/.test(e) || /^".*"$/.test(e)) return e.slice(1, -1)
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e)
  if (/^datetime\('now',\s*'localtime'\)$/i.test(e)) return nowLocal()
  if (/^last_insert_rowid\(\)$/i.test(e)) return row.__last_insert_rowid__

  const ifnull = e.match(/^IFNULL\s*\((.+)\)$/i)
  if (ifnull) {
    const args = splitArgs(ifnull[1])
    const a = evalValue(args[0], row, params, state)
    return a === null || a === undefined ? evalValue(args[1], row, params, state) : a
  }

  const substr = e.match(/^substr\s*\((.+)\)$/i)
  if (substr) {
    const args = splitArgs(substr[1])
    const str = String(evalValue(args[0], row, params, state) ?? '')
    const start = Number(evalValue(args[1], row, params, state)) - 1
    const len =
      args[2] === undefined ? undefined : Number(evalValue(args[2], row, params, state))
    return str.substr(start, len)
  }

  if (/^[A-Za-z_][\w\.]*$/.test(e)) return getField(row, e)
  throw new Error(`无法解析原子表达式: ${expr}`)
}

function evalValue(expr, row, params, state) {
  const e = String(expr || '').trim()

  // unwrap one layer of parens
  if (e.startsWith('(') && e.endsWith(')')) {
    return evalValue(e.slice(1, -1), row, params, state)
  }

  // comparison
  const cmp = e.match(/^(.+?)\s*(!=|<>|>=|<=|=|>|<)\s*(.+)$/)
  if (cmp && !/^IFNULL\s*\(/i.test(e) && !/^substr\s*\(/i.test(e)) {
    // avoid splitting inside function args: only if both sides balanced
    const left = cmp[1]
    const right = cmp[3]
    if (countPlaceholders(left) + (left.match(/\(/g) || []).length === (left.match(/\)/g) || []).length) {
      const lv = evalValue(left, row, params, state)
      const rv = evalValue(right, row, params, state)
      switch (cmp[2]) {
        case '=':
          return lv == rv // eslint-disable-line eqeqeq
        case '!=':
        case '<>':
          return lv != rv // eslint-disable-line eqeqeq
        case '>':
          return lv > rv
        case '<':
          return lv < rv
        case '>=':
          return lv >= rv
        case '<=':
          return lv <= rv
        default:
          break
      }
    }
  }

  return evalAtom(e, row, params, state)
}

function evalWhere(whereSql, row, params) {
  if (!whereSql || !String(whereSql).trim()) return true
  const conds = splitTop(whereSql.trim(), ' AND ')
  const state = { i: 0 }
  return conds.every((c) => !!evalValue(c, row, params, state))
}

function parseSelectItems(list) {
  return splitArgs(list).map((item) => {
    const asMatch = item.match(/^(.+?)\s+AS\s+(\w+)$/i)
    if (asMatch) return { expr: asMatch[1].trim(), as: asMatch[2] }
    if (/^[A-Za-z_][\w\.]*$/.test(item.trim())) {
      const parts = item.trim().split('.')
      return { expr: item.trim(), as: parts[parts.length - 1] }
    }
    return { expr: item.trim(), as: item.trim() }
  })
}

function isAggExpr(expr) {
  return /(^|\W)(SUM|COUNT|MAX)\s*\(/i.test(expr)
}

function aggValue(expr, rows) {
  const e = expr.trim()

  if (/^COUNT\s*\(\s*\*\s*\)$/i.test(e)) return rows.length

  const count = e.match(/^COUNT\s*\((.+)\)$/i)
  if (count) {
    const inner = count[1].trim()
    return rows.reduce((n, row) => {
      const v = evalValue(inner, row, [], { i: 0 })
      return n + (v === null || v === undefined ? 0 : 1)
    }, 0)
  }

  if (/SUM\s*\(/i.test(e)) {
    const inner = e.match(/SUM\s*\((.+?)\)/i)[1]
    const total = rows.reduce((n, row) => {
      const v = evalValue(inner, row, [], { i: 0 })
      return n + (Number(v) || 0)
    }, 0)
    if (/^IFNULL\s*\(/i.test(e)) {
      const args = splitArgs(e.replace(/^IFNULL\s*\(/i, '').replace(/\)$/, ''))
      return total === null || total === undefined
        ? evalValue(args[1], {}, [], { i: 0 })
        : total
    }
    return total
  }

  if (/MAX\s*\(/i.test(e)) {
    const inner = e.match(/MAX\s*\((.+?)\)/i)[1]
    let best = null
    rows.forEach((row) => {
      const v = evalValue(inner, row, [], { i: 0 })
      if (best === null || v > best) best = v
    })
    if (/^IFNULL\s*\(/i.test(e)) {
      const args = splitArgs(e.replace(/^IFNULL\s*\(/i, '').replace(/\)$/, ''))
      return best === null ? evalValue(args[1], {}, [], { i: 0 }) : best
    }
    return best
  }

  return evalValue(e, rows[0] || {}, [], { i: 0 })
}

class Statement {
  constructor(db, sql) {
    this.db = db
    this.sql = normalizeSql(sql)
    this.params = []
    this._rows = null
    this._i = 0
  }

  bind(params) {
    this.params = Array.isArray(params) ? params.slice() : []
    this._rows = null
    this._i = 0
    return this
  }

  run(params) {
    if (params) this.bind(params)
    this.db._runOne(this.sql, this.params)
    return this
  }

  step() {
    if (!this._rows) {
      this._rows = this.db._select(this.sql, this.params)
      this._i = 0
    }
    if (this._i >= this._rows.length) return false
    this._cur = this._rows[this._i]
    this._i += 1
    return true
  }

  getAsObject() {
    return Object.assign({}, this._cur || {})
  }

  free() {}
}

class Database {
  constructor(bytes) {
    this.tables = {}
    this.lastId = 0
    const len = bytes
      ? bytes.byteLength !== undefined
        ? bytes.byteLength
        : bytes.length
      : 0
    if (len) this._load(bytes)
  }

  _load(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
    const text = decodeUtf8(u8)
    if (!text.startsWith(`${MAGIC}\n`)) {
      // 旧 sql.js 二进制等不兼容格式：当作空库
      this.tables = {}
      this.lastId = 0
      return
    }
    const data = JSON.parse(text.slice(MAGIC.length + 1))
    this.tables = data.tables || {}
    this.lastId = data.lastId || 0
  }

  export() {
    return encodeUtf8(
      `${MAGIC}\n${JSON.stringify({ tables: this.tables, lastId: this.lastId })}`
    )
  }

  run(sql, params = []) {
    splitStatements(sql).forEach((s) => this._runOne(s, params))
  }

  exec(sql) {
    const out = []
    splitStatements(sql).forEach((s) => {
      if (/^SELECT\b/i.test(s)) {
        const rows = this._select(s, [])
        if (!rows.length) return
        const columns = Object.keys(rows[0])
        out.push({
          columns,
          values: rows.map((r) => columns.map((c) => r[c]))
        })
      } else {
        this._runOne(s, [])
      }
    })
    return out
  }

  prepare(sql) {
    return new Statement(this, sql)
  }

  _table(name) {
    if (!this.tables[name]) throw new Error(`表不存在: ${name}`)
    return this.tables[name]
  }

  _runOne(sql, params) {
    if (/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(sql)) {
      this._createTable(sql)
      return
    }
    if (/^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i.test(sql)) return
    if (/^INSERT\s+INTO/i.test(sql)) {
      this._insert(sql, params)
      return
    }
    if (/^UPDATE\s+/i.test(sql)) {
      this._update(sql, params)
      return
    }
    if (/^DELETE\s+FROM/i.test(sql)) {
      this._delete(sql, params)
      return
    }
    if (/^SELECT\b/i.test(sql)) {
      this._select(sql, params)
      return
    }
    throw new Error(`不支持的 SQL: ${sql}`)
  }

  _createTable(sql) {
    const m = sql.match(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\((.*)\)$/i)
    if (!m) throw new Error(`不支持的 CREATE TABLE: ${sql}`)
    const name = m[1]
    if (this.tables[name]) return
    const cols = []
    splitArgs(m[2]).forEach((part) => {
      if (/^FOREIGN\s+KEY/i.test(part) || /^PRIMARY\s+KEY\s*\(/i.test(part)) return
      const cm = part.match(/^(\w+)\s+(\w+)(.*)$/i)
      if (!cm) return
      const rest = cm[3] || ''
      const def = rest.match(
        /DEFAULT\s+(\([^\)]+\)|'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)/i
      )
      cols.push({
        name: cm[1],
        autoincrement: /AUTOINCREMENT/i.test(rest) || /PRIMARY\s+KEY/i.test(rest),
        notNull: /NOT\s+NULL/i.test(rest),
        unique: /\bUNIQUE\b/i.test(rest),
        default: def ? parseDefault(def[1]) : null
      })
    })
    this.tables[name] = { columns: cols, rows: [], seq: 0 }
  }

  _defaultFor(col) {
    if (!col.default) return null
    if (col.default.kind === 'now') return nowLocal()
    return col.default.value
  }

  _insert(sql, params) {
    const m = sql.match(
      /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\((.+)\)$/i
    )
    if (!m) throw new Error(`不支持的 INSERT: ${sql}`)
    const table = this._table(m[1])
    const cols = splitArgs(m[2])
    const vals = splitArgs(m[3])
    const row = {}
    table.columns.forEach((c) => {
      row[c.name] = this._defaultFor(c)
    })
    const state = { i: 0 }
    cols.forEach((c, idx) => {
      row[c] = evalValue(vals[idx], row, params, state)
    })
    table.columns.forEach((c) => {
      if (c.autoincrement && (row[c.name] === null || row[c.name] === undefined)) {
        table.seq += 1
        row[c.name] = table.seq
      }
      if (c.unique) {
        if (table.rows.some((r) => r[c.name] === row[c.name])) {
          throw new Error(`UNIQUE 约束失败: ${c.name}`)
        }
      }
    })
    table.rows.push(row)
    if (row.id != null) this.lastId = row.id
  }

  _update(sql, params) {
    const m = sql.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i)
    if (!m) throw new Error(`不支持的 UPDATE: ${sql}`)
    const table = this._table(m[1])
    const sets = splitArgs(m[2]).map((item) => {
      const mm = item.match(/^(\w+)\s*=\s*(.+)$/)
      if (!mm) throw new Error(`错误的 SET: ${item}`)
      return { col: mm[1], expr: mm[2] }
    })
    const setParamCount = sets.reduce((n, s) => n + countPlaceholders(s.expr), 0)
    const whereParams = params.slice(setParamCount)
    table.rows.forEach((row) => {
      if (!evalWhere(m[3] || '', row, whereParams)) return
      const state = { i: 0 }
      sets.forEach((s) => {
        row[s.col] = evalValue(s.expr, row, params, state)
      })
    })
  }

  _delete(sql, params) {
    const m = sql.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i)
    if (!m) throw new Error(`不支持的 DELETE: ${sql}`)
    const table = this._table(m[1])
    table.rows = table.rows.filter((row) => !evalWhere(m[2] || '', row, params))
  }

  _aliasRow(row, alias) {
    const out = {}
    Object.keys(row).forEach((k) => {
      out[k] = row[k]
      out[`${alias}.${k}`] = row[k]
    })
    return out
  }

  _from(fromSql, params) {
    const leftJoin = fromSql.match(
      /^(\w+)(?:\s+(\w+))?\s+LEFT\s+JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+(.+)$/i
    )
    if (leftJoin) {
      const lName = leftJoin[1]
      const lAlias = leftJoin[2] || lName
      const rName = leftJoin[3]
      const rAlias = leftJoin[4] || rName
      const onSql = leftJoin[5]
      const out = []
      this._table(lName).rows.forEach((lrow) => {
        const left = this._aliasRow(lrow, lAlias)
        let matched = false
        this._table(rName).rows.forEach((rrow) => {
          const right = this._aliasRow(rrow, rAlias)
          const merged = Object.assign({}, right, left)
          if (evalWhere(onSql, merged, params)) {
            matched = true
            out.push(merged)
          }
        })
        if (!matched) {
          const nullRight = {}
          this._table(rName).columns.forEach((c) => {
            nullRight[c.name] = null
            nullRight[`${rAlias}.${c.name}`] = null
          })
          out.push(Object.assign({}, nullRight, left))
        }
      })
      return { rows: out, paramUsed: countPlaceholders(onSql) }
    }

    const join = fromSql.match(
      /^(\w+)(?:\s+(\w+))?\s+JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+(.+)$/i
    )
    if (join) {
      const lName = join[1]
      const lAlias = join[2] || lName
      const rName = join[3]
      const rAlias = join[4] || rName
      const onSql = join[5]
      const out = []
      this._table(lName).rows.forEach((lrow) => {
        const left = this._aliasRow(lrow, lAlias)
        this._table(rName).rows.forEach((rrow) => {
          const right = this._aliasRow(rrow, rAlias)
          const merged = Object.assign({}, left, right)
          if (evalWhere(onSql, merged, params)) out.push(merged)
        })
      })
      return { rows: out, paramUsed: countPlaceholders(onSql) }
    }

    const single = fromSql.match(/^(\w+)(?:\s+(\w+))?$/i)
    if (!single) throw new Error(`不支持的 FROM: ${fromSql}`)
    const alias = single[2] || single[1]
    return {
      rows: this._table(single[1]).rows.map((r) => this._aliasRow(r, alias)),
      paramUsed: 0
    }
  }

  _select(sql, params) {
    // 无 FROM：如 SELECT last_insert_rowid() AS id
    const noFrom = sql.match(/^SELECT\s+(.+)$/i)
    const m = sql.match(
      /^SELECT\s+(.+?)\s+FROM\s+(.+?)(?:\s+WHERE\s+(.+?))?(?:\s+GROUP\s+BY\s+(.+?))?(?:\s+HAVING\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+))?$/i
    )
    if (!m) {
      if (noFrom && !/\bFROM\b/i.test(sql)) {
        const items = parseSelectItems(noFrom[1])
        const out = {}
        items.forEach((it) => {
          if (/^last_insert_rowid\(\)$/i.test(it.expr)) out[it.as] = this.lastId
          else out[it.as] = evalValue(it.expr, { __last_insert_rowid__: this.lastId }, params, { i: 0 })
        })
        return [out]
      }
      throw new Error(`不支持的 SELECT: ${sql}`)
    }

    const items = parseSelectItems(m[1])
    const from = this._from(m[2].trim(), params)
    const whereParams = params.slice(from.paramUsed)
    let rows = from.rows.filter((row) => evalWhere(m[3] || '', row, whereParams))

    if (m[4]) {
      const groups = new Map()
      splitArgs(m[4]).forEach(() => {})
      const gexprs = splitArgs(m[4])
      rows.forEach((row) => {
        const key = gexprs.map((g) => String(evalValue(g, row, [], { i: 0 }))).join('|')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(row)
      })
      const grouped = []
      groups.forEach((grows) => {
        const out = {}
        items.forEach((it) => {
          out[it.as] = isAggExpr(it.expr)
            ? aggValue(it.expr, grows)
            : evalValue(it.expr, grows[0], [], { i: 0 })
        })
        if (m[5] && !evalWhere(m[5], out, [])) return
        grouped.push(out)
      })
      rows = grouped
    } else if (items.some((it) => isAggExpr(it.expr))) {
      const out = {}
      items.forEach((it) => {
        if (isAggExpr(it.expr)) out[it.as] = aggValue(it.expr, rows)
        else if (/^last_insert_rowid\(\)$/i.test(it.expr)) out[it.as] = this.lastId
        else out[it.as] = evalValue(it.expr, rows[0] || {}, [], { i: 0 })
      })
      rows = [out]
    } else {
      rows = rows.map((row) => {
        const out = {}
        items.forEach((it) => {
          if (/^last_insert_rowid\(\)$/i.test(it.expr)) out[it.as] = this.lastId
          else out[it.as] = evalValue(it.expr, row, [], { i: 0 })
        })
        return out
      })
    }

    if (m[6]) {
      const orders = splitArgs(m[6]).map((item) => {
        const mm = item.trim().match(/^(.+?)(?:\s+(ASC|DESC))?$/i)
        return { key: mm[1].trim(), dir: (mm[2] || 'ASC').toUpperCase() }
      })
      rows.sort((a, b) => {
        for (let i = 0; i < orders.length; i += 1) {
          const { key, dir } = orders[i]
          const av = getField(a, key)
          const bv = getField(b, key)
          let c = 0
          if (av > bv) c = 1
          else if (av < bv) c = -1
          if (c !== 0) return dir === 'DESC' ? -c : c
        }
        return 0
      })
    }

    return rows
  }
}

function createEngine() {
  return { Database }
}

module.exports = {
  createEngine,
  Database,
  MAGIC
}
