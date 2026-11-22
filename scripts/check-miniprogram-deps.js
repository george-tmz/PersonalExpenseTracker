/**
 * 本地确认：
 * 1) 小程序源码无 Node 内置模块 fs/path/crypto 静态依赖
 * 2) 无 utils/sql-asm.js 文件
 * 3) 配置文件不再点名 sql-asm（避免「跳过 ES6 转 ES5」提示）
 *
 *   node scripts/check-miniprogram-deps.js
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const nodeBuiltinRe =
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
    if (nodeBuiltinRe.test(text)) offenders.push(path.relative(root, full))
  })
}

walk(root)

// babel / pack 配置不得再点名已删除的旧引擎路径（会触发「跳过 ES6 转 ES5」提示）
;['project.config.json', 'project.private.config.json'].forEach((name) => {
  const full = path.join(root, name)
  if (!fs.existsSync(full)) return
  try {
    const json = JSON.parse(fs.readFileSync(full, 'utf8'))
    const ignores = []
    const babelIgnore =
      (json.setting &&
        json.setting.babelSetting &&
        json.setting.babelSetting.ignore) ||
      (json.babelSetting && json.babelSetting.ignore) ||
      []
    if (Array.isArray(babelIgnore)) ignores.push(...babelIgnore)
    const packIgnore =
      (json.packOptions && json.packOptions.ignore) || []
    if (Array.isArray(packIgnore)) ignores.push(...packIgnore)
    if (ignores.some((x) => /sql-asm/i.test(String(x)))) {
      offenders.push(`${name} 的 ignore 列表仍包含 sql-asm 路径`)
    }
  } catch (err) {
    offenders.push(`${name} JSON 解析失败: ${err.message}`)
  }
})

// 代码中不得再 require/import sql-asm
const codeRootFiles = []
function walkCode(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (['.git', 'node_modules', 'scripts'].includes(ent.name)) return
      walkCode(full)
      return
    }
    if (!/\.js$/.test(ent.name)) return
    codeRootFiles.push(full)
  })
}
walkCode(root)
codeRootFiles.forEach((full) => {
  const text = fs.readFileSync(full, 'utf8')
  if (/sql-asm/i.test(text) && !/mini-sqlite/.test(path.basename(full))) {
    // 允许注释/文档式提及？源码 js 不应再引用
    if (/require\s*\(\s*['"].*sql-asm|from\s+['"].*sql-asm|sql-asm\.js/.test(text)) {
      offenders.push(`${path.relative(root, full)} 仍引用 sql-asm`)
    }
  }
})

if (offenders.length) {
  console.error('依赖/配置检查失败:')
  offenders.forEach((f) => console.error(' -', f))
  process.exit(1)
}

console.log(
  'DEPS_OK: 无 fs/path/crypto 静态依赖；无 sql-asm.js；配置 babel ignore 未点名 sql-asm'
)
