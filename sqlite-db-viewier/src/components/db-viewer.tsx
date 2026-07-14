'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { TableSidebar } from '@/components/table-sidebar'
import { DataTable, SortState } from '@/components/data-table'
import { SourcePicker, SourceInfo } from '@/components/source-picker'
import { NoDatabase, NoTableSelected } from '@/components/empty-state'

// How often to re-fetch sources + re-fetch the current table (milliseconds)
const SYNC_POLL_MS = 60_000

interface TableInfo {
  name: string
  type: 'table' | 'view'
  rowCount: number
}

interface Column {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

interface RowsResponse {
  columns: Column[]
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export function DbViewer() {
  // ── Sources ──────────────────────────────────────────────────────────────
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)

  // ── Tables ───────────────────────────────────────────────────────────────
  const [tables, setTables] = useState<TableInfo[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [dbMissing, setDbMissing] = useState(false)

  // ── Rows ─────────────────────────────────────────────────────────────────
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [rowsData, setRowsData] = useState<RowsResponse | null>(null)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [rowsError, setRowsError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sort, setSort] = useState<SortState>({ col: null, dir: 'asc' })

  // ── Fetch sources ─────────────────────────────────────────────────────────
  const fetchSources = useCallback(async (silent = false) => {
    if (!silent) setSourcesLoading(true)
    try {
      const res = await fetch('/api/sources')
      if (!res.ok) return
      const data = await res.json()
      setSources(data.sources ?? [])
      // Auto-select the first source if none selected yet and sources arrived
      setSelectedSource((prev) => {
        if (prev) return prev
        return data.sources?.[0]?.name ?? null
      })
    } catch {
      // silently ignore network failures during background polls
    } finally {
      if (!silent) setSourcesLoading(false)
    }
  }, [])

  // ── Fetch tables ──────────────────────────────────────────────────────────
  const fetchTables = useCallback(async (source: string | null, silent = false) => {
    if (!silent) { setTablesLoading(true); setTablesError(null); setDbMissing(false) }
    try {
      const params = source ? `?source=${encodeURIComponent(source)}` : ''
      const res = await fetch(`/api/tables${params}`)
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 404) {
          setDbMissing(true)
          setTables([])
        } else {
          setTablesError(data.error ?? 'Failed to load tables')
        }
        return
      }
      setTables(data.tables)
      setFilename(data.filename)
      setDbMissing(false)
      // Auto-select first table when switching source
      if (!silent) {
        setSelectedTable(data.tables[0]?.name ?? null)
      }
    } catch {
      if (!silent) setTablesError('Network error — could not reach the server.')
    } finally {
      if (!silent) setTablesLoading(false)
    }
  }, [])

  // ── Fetch rows ────────────────────────────────────────────────────────────
  const fetchRows = useCallback(
    async (
      table: string,
      page: number,
      size: number,
      sortState: SortState,
      source: string | null
    ) => {
      setRowsLoading(true)
      setRowsError(null)
      try {
        const params = new URLSearchParams({ table, page: String(page), pageSize: String(size) })
        if (sortState.col) { params.set('orderBy', sortState.col); params.set('orderDir', sortState.dir) }
        if (source) params.set('source', source)
        const res = await fetch(`/api/rows?${params.toString()}`)
        const data = await res.json()
        if (!res.ok) { setRowsError(data.error ?? 'Failed to load rows'); return }
        setRowsData(data)
      } catch {
        setRowsError('Network error — could not reach the server.')
      } finally {
        setRowsLoading(false)
      }
    },
    []
  )

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { fetchSources() }, [fetchSources])

  // ── When selectedSource changes → reload tables (and clear table selection) ──
  useEffect(() => {
    setSelectedTable(null)
    setRowsData(null)
    if (selectedSource !== undefined) fetchTables(selectedSource)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource])

  // ── When selected table / page / sort changes → load rows ─────────────────
  useEffect(() => {
    if (!selectedTable) return
    fetchRows(selectedTable, currentPage, pageSize, sort, selectedSource)
  }, [selectedTable, currentPage, pageSize, sort, selectedSource, fetchRows])

  // ── Auto-refresh every 60 s ───────────────────────────────────────────────
  const selectedSourceRef = useRef(selectedSource)
  selectedSourceRef.current = selectedSource
  const selectedTableRef = useRef(selectedTable)
  selectedTableRef.current = selectedTable

  useEffect(() => {
    const id = setInterval(() => {
      fetchSources(true)
      fetchTables(selectedSourceRef.current, true)
      if (selectedTableRef.current) {
        fetchRows(
          selectedTableRef.current,
          currentPage,
          pageSize,
          sort,
          selectedSourceRef.current
        )
      }
    }, SYNC_POLL_MS)
    return () => clearInterval(id)
    // currentPage/pageSize/sort are stable refs here — intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSources, fetchTables, fetchRows])

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSelectSource(name: string | null) {
    setSelectedSource(name)
  }

  function handleRefreshSources() {
    fetchSources()
    if (selectedSource !== undefined) fetchTables(selectedSource)
  }

  function handleSelectTable(name: string) {
    setSelectedTable(name)
    setCurrentPage(1)
    setSort({ col: null, dir: 'asc' })
    setRowsData(null)
  }

  // ── No synced sources and no local DB → empty state ───────────────────────
  const showNoDatabase = !sourcesLoading && dbMissing && sources.length === 0

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex flex-col h-full border-r border-border bg-card w-64 shrink-0">
        <SourcePicker
          sources={sources}
          selectedSource={selectedSource}
          onSelectSource={handleSelectSource}
          onRefresh={handleRefreshSources}
          loading={sourcesLoading}
        />
        <TableSidebar
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={handleSelectTable}
          loading={tablesLoading}
          error={tablesError}
          filename={filename}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {showNoDatabase ? (
          <NoDatabase />
        ) : !selectedTable && !tablesLoading ? (
          <NoTableSelected />
        ) : (
          <DataTable
            tableName={selectedTable ?? ''}
            columns={rowsData?.columns ?? []}
            rows={rowsData?.rows ?? []}
            total={rowsData?.total ?? 0}
            page={currentPage}
            pageSize={pageSize}
            totalPages={rowsData?.totalPages ?? 1}
            loading={rowsLoading}
            error={rowsError}
            sort={sort}
            onPageChange={setCurrentPage}
            onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1) }}
            onSortChange={(s) => { setSort(s); setCurrentPage(1) }}
          />
        )}
      </main>
    </div>
  )
}
