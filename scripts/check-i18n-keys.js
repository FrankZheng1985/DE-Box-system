#!/usr/bin/env node
/**
 * 三语语言包一致性校验（P9）
 *
 * 对每个端检查三件事：
 *   1. zh / en / de 三份包的 key 集合完全一致（不多不少）
 *   2. 同一个 key 的插值占位符 {{xxx}} 三语一一对应
 *   3. 代码里 t('a.b') 用到的 key 在语言包里都有定义
 *
 * 用法：
 *   node scripts/check-i18n-keys.js              # 检查全部三端
 *   node scripts/check-i18n-keys.js admin        # 只检查某一端
 *
 * 退出码 0 = 通过，1 = 有问题。
 *
 * ⚠️ 只认静态字面量 t('a.b')。用模板字符串拼出来的 key（如 t(`status.${x}`)）
 *    检查不到，脚本会把这些文件单独列出来提醒人工确认。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const APPS = ['admin', 'customer-portal', 'carrier-portal']
const LANGS = ['zh', 'en', 'de']

const targets = process.argv.slice(2).length ? process.argv.slice(2) : APPS

/** 把嵌套对象拍平成 "a.b.c" -> value */
function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, name))
    } else {
      out[name] = v
    }
  }
  return out
}

function walkSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'locales') continue
      walkSourceFiles(full, acc)
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

const STATIC_KEY = /\bt\(\s*['"]([\w.]+)['"]/g
const INDIRECT_KEY = /(?:labelKey|titleKey|descriptionKey|placeholderKey)\s*[:=]\s*['"]([\w.]+)['"]/g
const TEMPLATE_KEY = /\bt\(\s*`/
const PLACEHOLDER = /\{\{\s*(\w+)/g

let failed = false

for (const app of targets) {
  const srcDir = path.join(ROOT, app, 'src')
  const localeDir = path.join(srcDir, 'i18n', 'locales')
  if (!fs.existsSync(localeDir)) {
    process.stdout.write(`跳过 ${app}（没有 src/i18n/locales）\n`)
    continue
  }

  const packs = {}
  for (const lang of LANGS) {
    const file = path.join(localeDir, `${lang}.json`)
    packs[lang] = flatten(JSON.parse(fs.readFileSync(file, 'utf8')))
  }

  const base = new Set(Object.keys(packs.zh))

  // 1. key 集合一致
  for (const lang of ['en', 'de']) {
    for (const k of [...base].filter((k) => !(k in packs[lang])).sort()) {
      process.stdout.write(`[${app}/${lang}] 缺 key: ${k}\n`)
      failed = true
    }
    for (const k of Object.keys(packs[lang]).filter((k) => !base.has(k)).sort()) {
      process.stdout.write(`[${app}/${lang}] 多出 key: ${k}\n`)
      failed = true
    }
  }

  // 2. 插值占位符一致
  for (const [k, zhText] of Object.entries(packs.zh)) {
    const want = new Set(String(zhText).match(PLACEHOLDER) || [])
    for (const lang of ['en', 'de']) {
      if (!(k in packs[lang])) continue
      const got = new Set(String(packs[lang][k]).match(PLACEHOLDER) || [])
      if (want.size !== got.size || [...want].some((p) => !got.has(p))) {
        process.stdout.write(
          `[${app}/${lang}] 占位符不一致 ${k}: zh=${[...want]} ${lang}=${[...got]}\n`
        )
        failed = true
      }
    }
  }

  // 3. 代码用到但没定义
  const used = new Set()
  const dynamicFiles = new Set()
  for (const file of walkSourceFiles(srcDir)) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(STATIC_KEY)) used.add(m[1])
    for (const m of text.matchAll(INDIRECT_KEY)) used.add(m[1])
    if (TEMPLATE_KEY.test(text)) dynamicFiles.add(path.relative(ROOT, file))
  }
  for (const k of [...used].filter((k) => !base.has(k)).sort()) {
    process.stdout.write(`[${app}/代码] 用了但语言包没有: ${k}\n`)
    failed = true
  }

  process.stdout.write(
    `${app}: 三语各 ${base.size} 个 key，代码静态引用 ${used.size} 个\n`
  )
  if (dynamicFiles.size) {
    process.stdout.write(
      `  模板字符串拼 key 的文件（脚本查不到，需人工确认）：\n` +
        [...dynamicFiles].sort().map((f) => `    - ${f}\n`).join('')
    )
  }
}

process.exit(failed ? 1 : 0)
