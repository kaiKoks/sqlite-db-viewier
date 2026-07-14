import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import {
  sanitizeSourceName,
  ensureSyncedDir,
  readMeta,
  writeMeta,
  getSyncedDbWritePath,
} from '@/lib/db'

export const dynamic = 'force-dynamic'

// Max allowed upload size: 512 MB
const MAX_SIZE = 512 * 1024 * 1024

export async function POST(request: NextRequest) {
  const rawSource = request.nextUrl.searchParams.get('source')
  if (!rawSource) {
    return NextResponse.json({ error: 'Missing "source" query parameter.' }, { status: 400 })
  }

  const source = sanitizeSourceName(rawSource)
  if (!source) {
    return NextResponse.json(
      { error: 'Invalid source name. Use letters, numbers, underscores, hyphens, and dots only.' },
      { status: 400 }
    )
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large (max 512 MB).' }, { status: 413 })
  }

  try {
    const buffer = Buffer.from(await request.arrayBuffer())

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty body received.' }, { status: 400 })
    }

    // Quick SQLite magic-byte check: first 16 bytes should be "SQLite format 3\000"
    const magic = buffer.slice(0, 16).toString('ascii')
    if (!magic.startsWith('SQLite format 3')) {
      return NextResponse.json({ error: 'File does not appear to be a valid SQLite database.' }, { status: 422 })
    }

    ensureSyncedDir()
    const destPath = getSyncedDbWritePath(source)
    fs.writeFileSync(destPath, buffer)

    // Update meta
    const meta = readMeta()
    meta[source] = { lastSync: new Date().toISOString(), size: buffer.byteLength }
    writeMeta(meta)

    return NextResponse.json({
      ok: true,
      source,
      size: buffer.byteLength,
      lastSync: meta[source].lastSync,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
