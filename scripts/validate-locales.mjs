import {
  closeSync, fstatSync, openSync, opendirSync, readFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src/lib/locales')
const sourcePath = path.join(localesDir, 'en.json')

function readCatalog(filePath) {
  return JSON.parse(readUtf8File(filePath))
}

function readUtf8File(filePath) {
  const fd = openSync(filePath, 'r')
  try {
    return readFileSync(fd, 'utf8')
  } finally {
    closeSync(fd)
  }
}

function directoryFiles(dirPath) {
  const dir = opendirSync(dirPath)
  try {
    const files = []
    let entry = dir.readSync()
    while (entry) {
      if (entry.isFile()) files.push(entry.name)
      entry = dir.readSync()
    }
    return files
  } finally {
    dir.closeSync()
  }
}

function ensureDirectory(dirPath) {
  const fd = openSync(dirPath, 'r')
  try {
    if (!fstatSync(fd).isDirectory()) {
      throw new Error(`${dirPath} is not a directory`)
    }
  } finally {
    closeSync(fd)
  }
}

function isFlatObject(value) {
  if (!value) return false
  if (typeof value !== 'object') return false
  return !Array.isArray(value)
}

function assertFlatStringCatalog(locale, catalog) {
  if (!isFlatObject(catalog)) {
    throw new Error(`${locale}: expected a flat object of translation keys`)
  }

  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string') {
      throw new Error(`${locale}: key "${key}" must map to a string`)
    }
  }
}

const sourceCatalog = readCatalog(sourcePath)
assertFlatStringCatalog('en', sourceCatalog)

const sourceKeys = Object.keys(sourceCatalog).sort()
ensureDirectory(localesDir)
const localeFiles = directoryFiles(localesDir).filter((file) => file === 'en.json')

console.log(`Validated ${localeFiles.length} locale catalog(s) against ${sourceKeys.length} English keys.`)
