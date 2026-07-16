'use client'

import { useRef, useState } from 'react'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Key,
  AlertCircle,
} from 'lucide-react'

interface Column {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

export interface SortState {
  col: string | null
  dir: 'asc' | 'desc'
}

interface DataTableProps {
  tableName: string
  columns: Column[]
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  loading: boolean
  error: string | null
  sort: SortState
  isOpen: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onSortChange: (sort: SortState) => void
}

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500]

function formatCellValue(value: unknown): { display: string; isNull: boolean } {
  if (value === null || value === undefined) {
    return { display: 'NULL', isNull: true }
  }
  if (typeof value === 'object') {
    return { display: JSON.stringify(value), isNull: false }
  }
  return { display: String(value), isNull: false }
}

export function DataTable({
  tableName,
  columns,
  rows,
  total,
  page,
  pageSize,
  totalPages,
  loading,
  error,
  sort,
  isOpen,
  onPageChange,
  onPageSizeChange,
  onSortChange,
}: DataTableProps) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  const [pageInput, setPageInput] = useState('')
  const pageInputRef = useRef<HTMLInputElement>(null)

  function handleColumnSort(colName: string) {
    if (sort.col === colName) {
      onSortChange({ col: colName, dir: sort.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      onSortChange({ col: colName, dir: 'asc' })
    }
  }

  function handlePageInputCommit() {
    const num = parseInt(pageInput, 10)
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      onPageChange(num)
    }
    setPageInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-card shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className={`text-sm font-semibold text-foreground truncate ${!isOpen ? 'pl-7' : ''}`}>{tableName}</h2>
          {!loading && !error && (
            <Badge variant="secondary" className="font-mono text-xs shrink-0">
              {total.toLocaleString()} rows
            </Badge>
          )}
        </div>

        {!loading && !error && (
          <div className="flex items-center gap-3 shrink-0">
            {/* Rows per page */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => onPageSizeChange(Number(v))}
              >
                <SelectTrigger className="h-7 w-17.5 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-xs">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {start}–{end} of {total.toLocaleString()}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={page <= 1}
                  onClick={() => onPageChange(1)}
                  aria-label="First page"
                >
                  <ChevronsLeft className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                {/* Page jump input */}
                <div className="flex items-center gap-1">
                  <input
                    ref={pageInputRef}
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    placeholder={String(page)}
                    onChange={(e) => setPageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePageInputCommit()
                    }}
                    onBlur={handlePageInputCommit}
                    className="w-12 h-7 rounded-md border border-input bg-background px-2 text-center text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground"
                    aria-label="Go to page"
                  />
                  <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(totalPages)}
                  aria-label="Last page"
                >
                  <ChevronsRight className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="p-5 space-y-2">
            <div className="flex gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 flex-1" />
              ))}
            </div>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 flex-1 opacity-70" />
                ))}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-destructive max-w-md">{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-sm">This table is empty.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <ScrollArea className="h-full w-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="hover:bg-transparent border-b border-border">
                  {columns.map((col) => {
                    const isActive = sort.col === col.name
                    return (
                      <TableHead
                        key={col.name}
                        className="whitespace-nowrap py-0 px-0 text-xs font-semibold text-foreground"
                      >
                        <button
                          onClick={() => handleColumnSort(col.name)}
                          className="flex items-center gap-1.5 w-full h-full px-3 py-2.5 hover:bg-accent/60 transition-colors group"
                          aria-label={`Sort by ${col.name}${col.primaryKey ? ' (primary key)' : ''}`}
                        >
                          {col.primaryKey && (
                            <Key className="size-3 text-amber-500 shrink-0" aria-hidden />
                          )}
                          <span className={isActive ? 'text-foreground' : ''}>{col.name}</span>
                          <span className="font-mono font-normal text-[10px] text-muted-foreground uppercase">
                            {col.type}
                          </span>
                          <span className="ml-auto shrink-0">
                            {isActive ? (
                              sort.dir === 'asc' ? (
                                <ArrowUp className="size-3 text-primary" />
                              ) : (
                                <ArrowDown className="size-3 text-primary" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                            )}
                          </span>
                        </button>
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={i}
                    className="hover:bg-accent/50 border-b border-border/50 transition-colors"
                  >
                    {columns.map((col) => {
                      const { display, isNull } = formatCellValue(row[col.name])
                      return (
                        <TableCell
                          key={col.name}
                          className="py-2 px-3 text-xs align-top max-w-[320px]"
                        >
                          {isNull ? (
                            <span className="text-muted-foreground/50 italic font-mono">NULL</span>
                          ) : display.length > 60 ? (
                            <Tooltip>
                              <TooltipTrigger
                                className="font-mono truncate block max-w-70 cursor-default text-left"
                                render={<span />}
                              >
                                {display}
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="max-w-100 break-all text-xs font-mono"
                              >
                                {display}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="font-mono truncate block max-w-70">{display}</span>
                          )}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
