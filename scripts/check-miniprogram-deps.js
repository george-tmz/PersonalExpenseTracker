/**
 * 本地确认小程序源码依赖图中不含 Node 内置模块 fs/path/crypto，
 * 且不再包含 utils/sql-asm.js。
 *
 *   node scripts/check-miniprogram-deps.js
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const re =
  /require\s*\(\s*['"](?:fs|path|crypto)['"]\s*\)|from\s+['"](?:fs|path|crypto)['"]|import\s*\(\s*['"](?:fs|path|crypto)['"]\s*\)/
const offenders = []

function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (['.git', 'node_modules', 'scripts'].includes(ent.name)) return
      walk(full)
      return
    }
    if (ent.name === 'sql-asm.js') {
      offenders.push(`${path.relative(root, full)} (应已删除)`)
      return
    }
    if (!/\.(js|json|wxs)$/.test(ent.name)) return
    const text = fs.readFileSync(full, 'utf8')
    if (re.test(text)) offenders.push(path.relative(root, full))
  })
}

walk(root)

if (offenders.length) {
  console.error('依赖检查失败:')
  offenders.forEach((f) => console.error(' -', f))
  process.exit(1)
}

console.log('DEPS_OK: 小程序源码无 require/import fs|path|crypto，且无 sql-asm.js')
