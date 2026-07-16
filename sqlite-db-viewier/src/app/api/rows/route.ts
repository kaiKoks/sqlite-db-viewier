import { NextRequest, NextResponse } from 'next/server'
import {
  getDbForSource,
  sanitizeSourceName,
  sqliteQuery,
} from '@/lib/db'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// Проверяем, запущено ли приложение в Netlify
const IS_NETLIFY = process.env.NETLIFY === 'true' || process.env.NEXT_PUBLIC_NETLIFY === 'true'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const table = searchParams.get('table')

  // 1. Сначала валидируем параметры, чтобы не скачивать базу зря
  if (!table) {
    return NextResponse.json({ error: 'Missing "table" query parameter.' }, { status: 400 })
  }

  const rawSource = request.nextUrl.searchParams.get('source') ?? null
  const source = rawSource ? sanitizeSourceName(rawSource) : null

  if (rawSource && !source) {
    return NextResponse.json({ error: 'Invalid source name.' }, { status: 400 })
  }

  let db: any = null

  try {
    // 2. Сразу пытаемся открыть БД. Если файла в Blobs нет — getDbForSource выбросит ошибку,
    // и мы вернем 404. Это избавляет от лишнего запроса к Blobs.
    db = await getDbForSource(source)
  } catch (err) {
    return NextResponse.json({ error: 'Database file not found.' }, { status: 404 })
  }

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const pageSize = Math.min(
    500,
    Math.max(1, parseInt(searchParams.get('pageSize') ?? String(PAGE_SIZE), 10))
  )
  const orderBy = searchParams.get('orderBy') ?? null
  const orderDir = searchParams.get('orderDir') === 'desc' ? 'DESC' : 'ASC'

  try {
    const tableExists = sqliteQuery(
      db,
      `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?`,
      [table]
    )
    if (tableExists.length === 0) {
      return NextResponse.json({ error: `Table "${table}" not found.` }, { status: 404 })
    }

    const offset = (page - 1) * pageSize

    const pragmaRows = sqliteQuery<{
      cid: number; name: string; type: string; notnull: number; pk: number
    }>(db, `PRAGMA table_info("${table}")`)

    const columns = pragmaRows.map((c) => ({
      name: c.name,
      type: c.type || 'UNKNOWN',
      notNull: Number(c.notnull) === 1,
      primaryKey: Number(c.pk) > 0,
    }))

    const countResult = sqliteQuery<{ count: number }>(
      db, `SELECT COUNT(*) as count FROM "${table}"`
    )
    const total = Number(countResult[0]?.count ?? 0)

    const validatedOrderBy =
      orderBy && columns.some((c) => c.name === orderBy) ? orderBy : null

    const orderClause = validatedOrderBy ? `ORDER BY "${validatedOrderBy}" ${orderDir}` : ''
    const rows = sqliteQuery(
      db,
      `SELECT * FROM "${table}" ${orderClause} LIMIT ? OFFSET ?`,
      [pageSize, offset]
    )

    return NextResponse.json({
      columns, rows, total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    // 3. Закрываем инстанс базы в блоке finally, гарантируя очистку памяти Wasm на Netlify
    if (IS_NETLIFY && db) {
      try {
        db.close()
      } catch (e) {
        console.error('Failed to close DB instance:', e)
      }
    }
  }
}