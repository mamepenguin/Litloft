// Merge addon translation files into core messages.
//
// Scans src/addons/*/messages/{locale}.json and deep-merges each into
// the corresponding src/messages/{locale}.json.
//
// Usage:  node scripts/merge-addon-messages.mjs
// Called: Dockerfile (after addon frontend copy, before pnpm build)

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, basename, dirname } from 'node:path'

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const MESSAGES_DIR = resolve(ROOT, 'src/messages')
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

if (!existsSync(ADDONS_DIR)) {
  console.log('[merge-addon-messages] No addons directory, skipping.')
  process.exit(0)
}

const addonFiles = []
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

if (addonFiles.length === 0) {
  console.log('[merge-addon-messages] No addon message files found, skipping.')
  process.exit(0)
}

const byLocale = new Map()
for (const entry of addonFiles) {
  if (!byLocale.has(entry.locale)) byLocale.set(entry.locale, [])
  byLocale.get(entry.locale).push(entry)
}

for (const [locale, entries] of byLocale) {
  const corePath = resolve(MESSAGES_DIR, `${locale}.json`)
  if (!existsSync(corePath)) {
    console.warn(`[merge-addon-messages] Core ${locale}.json not found, skipping.`)
    continue
  }

  let merged = JSON.parse(readFileSync(corePath, 'utf-8'))
  for (const entry of entries) {
    const addonMessages = JSON.parse(readFileSync(entry.path, 'utf-8'))
    merged = deepMerge(merged, addonMessages)
    console.log(`[merge-addon-messages] Merged: ${entry.addon}/${locale}.json`)
  }

  writeFileSync(corePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
}

console.log('[merge-addon-messages] Done.')
