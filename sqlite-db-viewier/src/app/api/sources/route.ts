import { NextResponse } from 'next/server'
import { getSyncedSources } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sources = await getSyncedSources() 
    return NextResponse.json({ sources })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}