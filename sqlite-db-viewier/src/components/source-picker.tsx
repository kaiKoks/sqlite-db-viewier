'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Monitor, RefreshCw, HardDrive, ChevronDown, Clock, ServerCrash } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

export interface SourceInfo {
  name: string
  lastSync: string
  size: number
}

interface SourcePickerProps {
  sources: SourceInfo[]
  selectedSource: string | null
  onSelectSource: (source: string | null) => void
  onRefresh: () => void
  loading: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SourcePicker({
  sources,
  selectedSource,
  onSelectSource,
  onRefresh,
  loading,
}: SourcePickerProps) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState<number | null>(null) // Защита от ошибок гидрации SSR
  const ref = useRef<HTMLDivElement>(null)

  // Устанавливаем время только на клиенте после монтирования
  useEffect(() => {
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 10000) // Обновляем каждые 10 сек
    return () => clearInterval(interval)
  }, [])

  // Закрытие дропдауна при клике вовне
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ИСПРАВЛЕНО: Безопасный поиск без утечки boolean `false`
  const current = sources.find((s) => s.name === selectedSource) ?? null

  const formatAgo = (iso: string): string => {
    if (!now) return '...' // Пока клиент не примонтирован, показываем заглушку
    const diff = Math.floor((now - new Date(iso).getTime()) / 1000)
    if (diff < 5) return 'just now'
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-32 rounded" />
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card text-muted-foreground">
        <ServerCrash className="size-3.5 shrink-0" />
        <span className="text-xs">No synced sources yet</span>
        <Tooltip>
          <TooltipTrigger
            onClick={onRefresh}
            aria-label="Refresh sources"
            className="ml-auto shrink-0 inline-flex size-5 items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <RefreshCw className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Refresh sources</TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative border-b border-border bg-card">
      {/* Trigger row */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex-1 min-w-0 flex items-center gap-2 px-2 py-1 rounded-md text-left',
            'hover:bg-accent transition-colors group'
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <Monitor className="size-3.5 shrink-0 text-primary" />
          <span className="text-xs font-medium text-foreground truncate">
            {current?.name ?? 'Select source'}
          </span>
          {current && (
            <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 shrink-0">
              <Clock className="size-2.5" />
              {formatAgo(current.lastSync)}
            </span>
          )}
          <ChevronDown
            className={cn(
              'size-3 text-muted-foreground ml-auto shrink-0 transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>

        <Tooltip>
          <TooltipTrigger
            onClick={onRefresh}
            aria-label="Refresh sources"
            className="shrink-0 inline-flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors"
          >
            <RefreshCw className="size-3" />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Refresh sources list</TooltipContent>
        </Tooltip>
      </div>

      {/* Dropdown list */}
      {open && (
        <div
          role="listbox"
          className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        >
          {sources.map((s) => {
            const isSelected = selectedSource === s.name
            return (
              <button
                key={s.name}
                role="option"
                aria-selected={isSelected}
                onClick={() => { onSelectSource(s.name); setOpen(false) }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'bg-primary/10 text-foreground'
                    : 'hover:bg-accent text-foreground'
                )}
              >
                <HardDrive className={cn('size-3.5 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{s.name}</span>
                    {isSelected && (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">active</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatBytes(s.size)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      synced {formatAgo(s.lastSync)}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}