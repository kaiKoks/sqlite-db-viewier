import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import {
  sanitizeSourceName,
  ensureSyncedDir,
  readMetaAsync,
  writeMetaAsync,
  getSyncedDbWritePath,
  saveDbToBlobs,
} from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_SIZE = 512 * 1024 * 1024

const IS_NETLIFY = process.env.NETLIFY === 'true' || process.env.NEXT_PUBLIC_NETLIFY === 'true'

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
    const arrayBuffer = await request.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Empty body received.' }, { status: 400 })
    }

    const magic = buffer.slice(0, 16).toString('ascii')
    if (!magic.startsWith('SQLite format 3')) {
      return NextResponse.json({ error: 'File does not appear to be a valid SQLite database.' }, { status: 422 })
    }

    if (IS_NETLIFY) {
      await saveDbToBlobs(source, buffer)
    } else {
      ensureSyncedDir()
      const destPath = getSyncedDbWritePath(source)
      fs.writeFileSync(destPath, buffer)
    }

    // Обновляем метаданные через асинхронные обертки
    const meta = await readMetaAsync()
    meta[source] = { lastSync: new Date().toISOString(), size: buffer.byteLength }
    await writeMetaAsync(meta)

    return NextResponse.json({
      ok: true,
      source,
      size: buffer.byteLength,
      lastSync: meta[source].lastSync,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Upload error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}