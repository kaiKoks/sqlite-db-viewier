import path from 'path'
import fs from 'fs'
import { getStore } from '@netlify/blobs'

// Use the pure asm.js build (no WASM, no native binaries required)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js/dist/sql-asm.js')

type SqlDatabase = {
  prepare: (sql: string) => SqlStatement
  close: () => void
}

type SqlStatement = {
  bind: (params: unknown[]) => void
  step: () => boolean
  getAsObject: () => Record<string, unknown>
  free: () => void
}

type SqlJs = {
  Database: new (data: Buffer | Uint8Array) => SqlDatabase
}

let _sqlJs: SqlJs | null = null

// Per-source DB cache: cacheKey -> { db, mtime }
const _dbCache = new Map<string, { db: SqlDatabase; mtime: number }>()

const IS_NETLIFY = process.env.NETLIFY === 'true' || process.env.NEXT_PUBLIC_NETLIFY === 'true'

const TEMP_DIR = IS_NETLIFY ? '/tmp/synced-dbs' : 'synced-dbs'

// ─── Path helpers ───────────────────────────────────────────────────────────

function getSyncedDir(): string {
  return path.join(process.cwd(), TEMP_DIR)
}

function getSyncedDbPath(source: string): string {
  return path.join(getSyncedDir(), `${source}.db`)
}

function getLocalDbPath(): string {
  return process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(process.cwd(), 'database.db')
}

function resolveDbPath(source: string | null): string {
  return source ? getSyncedDbPath(source) : getLocalDbPath()
}

// ─── Netlify Blobs helpers ─────────────────────────────────────────────────

async function getBlobStore() {
  return getStore('databases')
}

export async function saveDbToBlobs(source: string, buffer: Buffer): Promise<void> {
  const store = await getBlobStore()
  const arrayBuffer = new Uint8Array(buffer).buffer
  await store.set(`${source}.db`, arrayBuffer)
}

export async function loadDbFromBlobs(source: string): Promise<Buffer | null> {
  try {
    const store = await getBlobStore()
    const blob = await store.get(`${source}.db`, { type: 'arrayBuffer' })
    if (!blob) return null
    return Buffer.from(blob)
  } catch (error) {
    console.error(`Error loading ${source}.db from blobs:`, error)
    return null
  }
}

export async function deleteDbFromBlobs(source: string): Promise<void> {
  try {
    const store = await getBlobStore()
    await store.delete(`${source}.db`)
  } catch (error) {
    console.error(`Error deleting ${source}.db from blobs:`, error)
  }
}

async function listDbsFromBlobs(): Promise<string[]> {
  try {
    const store = await getBlobStore()
    const list = await store.list()
    return list.blobs
      .map(blob => blob.key)
      .filter(key => key.endsWith('.db'))
      .map(key => key.replace(/\.db$/, ''))
  } catch (error) {
    console.error('Error listing databases from blobs:', error)
    return []
  }
}

// ─── Async Meta management (Fix for Serverless) ──────────────────────────

function getMetaPath(): string {
  return path.join(getSyncedDir(), 'meta.json')
}

export async function readMetaAsync(): Promise<Record<string, Omit<SourceMeta, 'name'>>> {
  if (IS_NETLIFY) {
    try {
      const store = await getBlobStore()
      const data = await store.get('meta.json', { type: 'json' })
      return (data as Record<string, Omit<SourceMeta, 'name'>>) || {}
    } catch (error) {
      console.error('Error reading meta from blobs:', error)
      return {}
    }
  }
  
  const p = getMetaPath()
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return {} }
}

export async function writeMetaAsync(meta: Record<string, Omit<SourceMeta, 'name'>>): Promise<void> {
  if (IS_NETLIFY) {
    try {
      const store = await getBlobStore()
      await store.set('meta.json', JSON.stringify(meta))
    } catch (error) {
      console.error('Error writing meta to blobs:', error)
    }
    return
  }

  const p = getMetaPath()
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(p, JSON.stringify(meta, null, 2))
}

// ─── sql.js init ────────────────────────────────────────────────────────────

async function getSqlJs(): Promise<SqlJs> {
  if (_sqlJs) return _sqlJs
  _sqlJs = await initSqlJs()
  return _sqlJs!
}

// ─── DB access ──────────────────────────────────────────────────────────────

export async function getDbForSource(source: string | null): Promise<SqlDatabase> {
  if (IS_NETLIFY && source) {
    const buffer = await loadDbFromBlobs(source)
    if (!buffer) {
      throw new Error(`Database ${source} not found in blob storage`)
    }
    const SQL = await getSqlJs()
    return new SQL.Database(buffer)
  }

  const dbPath = resolveDbPath(source)
  const cacheKey = source ?? '__local__'

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`)
  }

  const stat = fs.statSync(dbPath)
  const mtime = stat.mtimeMs

  const cached = _dbCache.get(cacheKey)
  if (cached && cached.mtime === mtime) return cached.db

  if (cached) {
    try { cached.db.close() } catch { /* ignore */ }
    _dbCache.delete(cacheKey)
  }

  const SQL = await getSqlJs()
  const fileBuffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(fileBuffer)
  _dbCache.set(cacheKey, { db, mtime })
  return db
}

export async function dbExistsForSource(source: string | null): Promise<boolean> {
  if (IS_NETLIFY && source) {
    const buffer = await loadDbFromBlobs(source)
    return buffer !== null
  }
  return fs.existsSync(resolveDbPath(source))
}

// ─── Source management ──────────────────────────────────────────────────────

export type SourceMeta = {
  name: string
  lastSync: string
  size: number
}

export function sanitizeSourceName(raw: string): string | null {
  const clean = raw.trim().replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/^\.+/, '')
  if (!clean || clean.length > 64 || clean.includes('..')) return null
  return clean
}

export function ensureSyncedDir(): void {
  const dir = getSyncedDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function getSyncedSources(): Promise<SourceMeta[]> {
  if (IS_NETLIFY) {
    const names = await listDbsFromBlobs()
    const meta = await readMetaAsync() // Используем асинхронное чтение метаданных
    
    return names
      .map((name) => {
        const m = meta[name]
        return {
          name,
          lastSync: m?.lastSync ?? new Date().toISOString(),
          size: m?.size ?? 0,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  ensureSyncedDir()
  const meta = await readMetaAsync()
  const dir = getSyncedDir()
  try {
    const files = fs.readdirSync(dir)
    return files
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const name = f.replace(/\.db$/, '')
        const m = meta[name]
        const stat = fs.statSync(path.join(dir, f))
        return {
          name,
          lastSync: m?.lastSync ?? new Date(stat.mtime).toISOString(),
          size: stat.size,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Error reading synced sources:', error)
    return []
  }
}

export function getSyncedDbWritePath(source: string): string {
  return getSyncedDbPath(source)
}

export function sqliteQuery<T = Record<string, unknown>>(
  db: SqlDatabase,
  sql: string,
  params: unknown[] = []
): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

export function cleanupDbCache(): void {
  for (const [key, cached] of _dbCache) {
    try {
      cached.db.close()
    } catch {
      // ignore
    }
  }
  _dbCache.clear()
}