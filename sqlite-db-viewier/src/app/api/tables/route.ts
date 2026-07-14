import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import {
  getDbForSource,
  dbExistsForSource,
  sanitizeSourceName,
  sqliteQuery,
} from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const rawSource = request.nextUrl.searchParams.get('source') ?? null
  const source = rawSource ? sanitizeSourceName(rawSource) : null

  if (rawSource && !source) {
    return NextResponse.json({ error: 'Invalid source name.' }, { status: 400 })
  }

  if (!dbExistsForSource(source)) {
    return NextResponse.json(
      {
        error: source
          ? `No database found for source "${source}".`
          : 'Database file not found. Place a database.db file in the project root, or push one from a remote machine.',
      },
      { status: 404 }
    )
  }

  try {
    const db = await getDbForSource(source)

    const tables = sqliteQuery<{ name: string; type: string }>(
      db,
      `SELECT name, type FROM sqlite_master
       WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
       ORDER BY type, name`
    )

    const tablesWithCount = tables.map((t) => {
      try {
        const result = sqliteQuery<{ count: number }>(
          db,
          `SELECT COUNT(*) as count FROM "${t.name}"`
        )
        return { ...t, rowCount: result[0]?.count ?? 0 }
      } catch {
        return { ...t, rowCount: 0 }
      }
    })

    return NextResponse.json({
      tables: tablesWithCount,
      filename: source ? `${source}.db` : path.basename(process.env.DB_PATH ?? 'database.db'),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
