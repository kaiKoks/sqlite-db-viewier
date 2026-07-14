import { Database, Table2, MonitorOff } from 'lucide-react'

export function NoDatabase() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-10">
      <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
        <MonitorOff className="size-8 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">No database connected</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Push a database from a remote machine using the sync agent, or place a{' '}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">database.db</code>{' '}
          file in the project root. See the{' '}
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">SYNC_INSTRUCTIONS.md</code>{' '}
          file for setup steps.
        </p>
      </div>
    </div>
  )
}

export function NoTableSelected() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-10">
      <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
        <Table2 className="size-8 text-muted-foreground" />
      </div>
      <div className="max-w-xs space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">Select a table</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Choose a table from the sidebar to browse its data.
        </p>
      </div>
    </div>
  )
}

export function NoSource() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-10">
      <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
        <Database className="size-8 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">No sources synced yet</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Run the sync agent on a machine that has your SQLite database. It will push the file here
          and appear in the source picker automatically.
        </p>
      </div>
    </div>
  )
}
