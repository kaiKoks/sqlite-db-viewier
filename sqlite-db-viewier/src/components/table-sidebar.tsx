'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { Database, Table2, Eye, AlertCircle } from 'lucide-react'

interface TableInfo {
  name: string
  type: 'table' | 'view'
  rowCount: number
}

interface TableSidebarProps {
  tables: TableInfo[]
  selectedTable: string | null
  onSelectTable: (name: string) => void
  loading: boolean
  error: string | null
  filename: string
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function TableSidebar({
  tables,
  selectedTable,
  onSelectTable,
  loading,
  error,
  filename,
}: TableSidebarProps) {
  const tableList = tables.filter((t) => t.type === 'table')
  const viewList = tables.filter((t) => t.type === 'view')

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      {filename && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Database className="size-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium text-xs text-muted-foreground truncate" title={filename}>
              {filename}
            </span>
          </div>
        </div>
      )}

      {/* Table list */}
      <ScrollArea className="flex-1 px-2 py-2">
        {loading && (
          <div className="space-y-1.5 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-xs text-destructive leading-relaxed">{error}</p>
          </div>
        )}

        {!loading && !error && tables.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <Database className="size-8 text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground">No tables found</p>
          </div>
        )}

        {!loading && !error && tableList.length > 0 && (
          <div className="mb-1">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tables
            </p>
            {tableList.map((t) => (
              <SidebarItem
                key={t.name}
                name={t.name}
                rowCount={t.rowCount}
                type="table"
                isSelected={selectedTable === t.name}
                onClick={() => onSelectTable(t.name)}
              />
            ))}
          </div>
        )}

        {!loading && !error && viewList.length > 0 && (
          <div>
            {tableList.length > 0 && <Separator className="my-2" />}
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Views
            </p>
            {viewList.map((t) => (
              <SidebarItem
                key={t.name}
                name={t.name}
                rowCount={t.rowCount}
                type="view"
                isSelected={selectedTable === t.name}
                onClick={() => onSelectTable(t.name)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {!loading && !error && tables.length > 0 && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {tables.length} {tables.length === 1 ? 'object' : 'objects'}
          </p>
        </div>
      )}
    </div>
  )
}

function SidebarItem({
  name,
  rowCount,
  type,
  isSelected,
  onClick,
}: {
  name: string
  rowCount: number
  type: 'table' | 'view'
  isSelected: boolean
  onClick: () => void
}) {
  const Icon = type === 'view' ? Eye : Table2
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors group',
        isSelected
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          isSelected ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-accent-foreground'
        )}
      />
      <span className="truncate text-sm font-medium flex-1" title={name}>
        {name}
      </span>
      <Badge
        variant={isSelected ? 'secondary' : 'outline'}
        className={cn(
          'text-[10px] px-1.5 py-0 h-4 font-mono shrink-0',
          isSelected
            ? 'bg-primary-foreground/20 text-primary-foreground border-primary-foreground/20'
            : 'text-muted-foreground'
        )}
      >
        {formatCount(rowCount)}
      </Badge>
    </button>
  )
}
