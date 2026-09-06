// Merge addon translation files into core messages.
//
// Reads src/messages-core/{locale}.json (core-only, git-tracked),
// deep-merges src/addons/*/messages/{locale}.json into it,
// and writes the result to src/messages/{locale}.json (generated, gitignored).
//
// Usage:  node scripts/merge-addon-messages.mjs
// Called: Dockerfile (after addon frontend copy, before pnpm build)
//         Direct host deployment: run once before pnpm build / pnpm dev

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const CORE_DIR = resolve(ROOT, 'src/messages-core')
const MERGED_DIR = resolve(ROOT, 'src/messages')
const ADDONS_DIR = resolve(ROOT, 'src/addons')

function deepMerge(target, source) {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const sv = source[key]
    const tv = result[key]
    if (
      typeof sv === 'object' && sv !== null && !Array.isArray(sv) &&
      typeof tv === 'object' && tv !== null && !Array.isArray(tv)
    ) {
      result[key] = deepMerge(tv, sv)
    } else {
      result[key] = sv
    }
  }
  return result
}

if (!existsSync(CORE_DIR)) {
  console.error('[merge-addon-messages] src/messages-core/ not found.')
  process.exit(1)
}

mkdirSync(MERGED_DIR, { recursive: true })

// Collect addon message files
const addonFiles = []
if (existsSync(ADDONS_DIR)) {
  for (const addonName of readdirSync(ADDONS_DIR, { withFileTypes: true })) {
    if (!addonName.isDirectory() && !addonName.isSymbolicLink()) continue
    const messagesDir = resolve(ADDONS_DIR, addonName.name, 'messages')
    if (!existsSync(messagesDir)) continue
    for (const file of readdirSync(messagesDir)) {
      if (!file.endsWith('.json')) continue
      addonFiles.push({
        addon: addonName.name,
        locale: basename(file, '.json'),
        path: resolve(messagesDir, file),
      })
    }
  }
}

const byLocale = new Map()
for (const entry of addonFiles) {
  if (!byLocale.has(entry.locale)) byLocale.set(entry.locale, [])
  byLocale.get(entry.locale).push(entry)
}

// Process each core locale file
for (const file of readdirSync(CORE_DIR)) {
  if (!file.endsWith('.json')) continue
  const locale = basename(file, '.json')
  const corePath = resolve(CORE_DIR, file)
  const outPath = resolve(MERGED_DIR, file)

  let merged = JSON.parse(readFileSync(corePath, 'utf-8'))

  for (const entry of byLocale.get(locale) ?? []) {
    const addonMessages = JSON.parse(readFileSync(entry.path, 'utf-8'))
    merged = deepMerge(merged, addonMessages)
    console.log(`[merge-addon-messages] Merged: ${entry.addon}/${locale}.json`)
  }

  writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  console.log(`[merge-addon-messages] Written: src/messages/${file}`)
}

console.log('[merge-addon-messages] Done.')
