/**
 * 将上游 sql.js 的 sql-asm.js 裁成微信小程序可依赖分析的版本：
 * - 关闭 Node 环境检测
 * - 去掉 require("fs"|"path"|"crypto") 静态引用
 *
 * 用法：
 *   node scripts/patch-sql-asm-for-miniprogram.js [path/to/sql-asm.js]
 */
const fs = require('fs')
const path = require('path')

const target = path.resolve(
  process.argv[2] || path.join(__dirname, '../utils/sql-asm.js')
)

let s = fs.readFileSync(target, 'utf8')

const steps = [
  {
    name: 'force Ca=false',
    from: 'Ca="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node',
    to: 'Ca=!1'
  },
  {
    name: 'stub fs/path requires',
    from: 'var fs=require("fs"),Ha=require("path");',
    to: 'var fs=null,Ha=null;'
  },
  {
    name: 'replace Node crypto require',
    from: 'if(Ca)try{var a=require("crypto");if(a.randomFillSync)return c=>a.randomFillSync(c);var b=a.randomBytes;return c=>(c.set(b(c.byteLength)),c)}catch(c){}C("initRandomDevice")',
    to: 'return c=>{for(var i=0;i<c.length;i++)c[i]=255*Math.random()|0;return c}'
  }
]

for (const step of steps) {
  if (!s.includes(step.from)) {
    if (s.includes(step.to) || (step.name === 'force Ca=false' && s.includes('Ca=!1'))) {
      console.log(`skip (already patched): ${step.name}`)
      continue
    }
    console.error(`pattern not found: ${step.name}`)
    process.exit(1)
  }
  s = s.replace(step.from, step.to)
  console.log(`applied: ${step.name}`)
}

for (const name of ['fs', 'path', 'crypto']) {
  if (s.includes(`require("${name}")`) || s.includes(`require('${name}')`)) {
    console.error(`still contains require("${name}")`)
    process.exit(1)
  }
}

fs.writeFileSync(target, s)
console.log(`wrote ${target}`)
