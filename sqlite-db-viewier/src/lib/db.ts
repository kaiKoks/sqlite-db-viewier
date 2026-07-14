import path from 'path'
import fs from 'fs'

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
  Database: new (data: Buffer) => SqlDatabase
}

let _sqlJs: SqlJs | null = null

// Per-source DB cache: cacheKey -> { db, mtime }
const _dbCache = new Map<string, { db: SqlDatabase; mtime: number }>()

const SYNCED_DIR = 'synced-dbs'

// ─── Path helpers ───────────────────────────────────────────────────────────

function getSyncedDir(): string {
  return path.join(process.cwd(), SYNCED_DIR)
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

// ─── sql.js init ────────────────────────────────────────────────────────────

async function getSqlJs(): Promise<SqlJs> {
  if (_sqlJs) return _sqlJs
  _sqlJs = await initSqlJs()
  return _sqlJs!
}

// ─── DB access ──────────────────────────────────────────────────────────────

export async function getDbForSource(source: string | null): Promise<SqlDatabase> {
  const dbPath = resolveDbPath(source)
  const cacheKey = source ?? '__local__'

  const stat = fs.statSync(dbPath) // throws if missing — caller handles
  const mtime = stat.mtimeMs

  const cached = _dbCache.get(cacheKey)
  if (cached && cached.mtime === mtime) return cached.db

  // File changed or first load — (re)open
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

export function dbExistsForSource(source: string | null): boolean {
  return fs.existsSync(resolveDbPath(source))
}

// ─── Source management ──────────────────────────────────────────────────────

export type SourceMeta = {
  name: string
  lastSync: string
  size: number
}

/** Sanitise a source name so it is safe to use as a filename component. */
export function sanitizeSourceName(raw: string): string | null {
  const clean = raw.trim().replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/^\.+/, '')
  if (!clean || clean.length > 64 || clean.includes('..')) return null
  return clean
}

export function ensureSyncedDir(): void {
  const dir = getSyncedDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function getMetaPath(): string {
  return path.join(getSyncedDir(), 'meta.json')
}

export function readMeta(): Record<string, Omit<SourceMeta, 'name'>> {
  const p = getMetaPath()
  if (!fs.existsSync(p)) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return {} }
}

export function writeMeta(meta: Record<string, Omit<SourceMeta, 'name'>>): void {
  fs.writeFileSync(getMetaPath(), JSON.stringify(meta, null, 2))
}

/** Returns all synced sources sorted alphabetically. */
export function getSyncedSources(): SourceMeta[] {
  ensureSyncedDir()
  const meta = readMeta()
  const dir = getSyncedDir()
  try {
    return fs
      .readdirSync(dir)
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
  } catch {
    return []
  }
}

export function getSyncedDbWritePath(source: string): string {
  return getSyncedDbPath(source)
}

// ─── Query helper ───────────────────────────────────────────────────────────

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
