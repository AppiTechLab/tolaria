import { useContext, useEffect, useMemo, useState } from 'react'
import { trackEvent } from '../lib/telemetry'
import { translate } from '../lib/i18n'
import { tauriCall } from '../hooks/vaultLoaderCommands'
import { errorMessage } from '../utils/vaultErrors'
import { canonicalWikilinkTargetForEntry } from '../utils/wikilink'
import {
  executeTaskQuery,
  toggleTaskCheckedInContent,
  type MarkdownTask,
} from '../utils/taskQuery'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Checkbox, type CheckedState } from './ui/checkbox'
import { TasksBlockContext } from './tasksBlockContext'

interface TasksQueryBlockProps {
  query: string
}

interface TaskNoteMeta {
  target: string
  title: string
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-border/70 bg-background/80 p-3">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-full animate-pulse rounded bg-muted/70" />
      <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-muted/60" />
    </div>
  )
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase()
}

function filenameFromPath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return normalized.split('/').pop() ?? normalized
}

function fallbackTaskNoteMeta(task: MarkdownTask): TaskNoteMeta {
  const filename = filenameFromPath(task.path)
  return {
    target: filename.replace(/\.md$/iu, ''),
    title: filename,
  }
}

function taskNoteMeta(task: MarkdownTask, noteMetaByPath: Map<string, TaskNoteMeta>): TaskNoteMeta {
  return noteMetaByPath.get(normalizePath(task.path)) ?? fallbackTaskNoteMeta(task)
}

function renderTaskGroupKey(key: string, noteMetaByPath: Map<string, TaskNoteMeta>) {
  const noteMeta = noteMetaByPath.get(normalizePath(key))
  return noteMeta?.target ?? key.replaceAll('\\', '/').replace(/\.md$/iu, '')
}

function TaskRow({
  disabled,
  noteMetaByPath,
  onNavigateWikilink,
  onToggleTask,
  task,
}: {
  disabled: boolean
  noteMetaByPath: Map<string, TaskNoteMeta>
  onNavigateWikilink: (target: string) => void
  onToggleTask: (task: MarkdownTask, checked: CheckedState) => void
  task: MarkdownTask
}) {
  const noteMeta = taskNoteMeta(task, noteMetaByPath)

  return (
    <div className="flex items-start gap-3 border-t border-border/60 px-3 py-2 first:border-t-0">
      <Checkbox
        checked={task.checked}
        disabled={disabled}
        aria-label={task.description || noteMeta.title}
        className="mt-0.5"
        onCheckedChange={(checked) => onToggleTask(task, checked)}
      />
      <div className="min-w-0 flex-1">
        <Button
          variant="ghost"
          className="h-auto w-full justify-start px-0 py-0 text-left font-normal hover:bg-transparent"
          onClick={() => onNavigateWikilink(noteMeta.target)}
        >
          <span className={`truncate text-sm ${task.checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
            {task.description || noteMeta.title}
          </span>
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{noteMeta.title}</Badge>
          {task.prioritySymbol && <Badge variant="secondary">{task.prioritySymbol}</Badge>}
          {task.dueDate && <Badge variant="secondary">📅 {task.dueDate}</Badge>}
        </div>
      </div>
    </div>
  )
}

export function TasksQueryBlock({ query }: TasksQueryBlockProps) {
  const { entries, locale, onNavigateWikilink, vaultPath } = useContext(TasksBlockContext)
  const [contentByPath, setContentByPath] = useState<Record<string, string> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingPaths, setSavingPaths] = useState<Set<string>>(new Set())

  const noteMetaByPath = useMemo(() => new Map(
    entries.map((entry) => [
      normalizePath(entry.path),
      {
        target: vaultPath ? canonicalWikilinkTargetForEntry(entry, vaultPath) : entry.title,
        title: entry.title,
      },
    ]),
  ), [entries, vaultPath])

  useEffect(() => {
    let canceled = false
    if (!vaultPath) {
      setContentByPath({})
      setIsLoading(false)
      setLoadError(null)
      return () => {
        canceled = true
      }
    }

    setIsLoading(true)
    tauriCall<Record<string, string>>({
      command: 'get_all_content',
      tauriArgs: { vaultPath },
      mockArgs: { path: vaultPath },
    })
      .then((nextContent) => {
        if (canceled) return
        setContentByPath(nextContent)
        setLoadError(null)
      })
      .catch((error) => {
        if (canceled) return
        setContentByPath({})
        setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!canceled) setIsLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [vaultPath])

  const queryResult = useMemo(() => {
    if (!contentByPath) return null
    return executeTaskQuery({ queryText: query, contentByPath })
  }, [contentByPath, query])

  const groupedTasks = queryResult?.groups.length ? queryResult.groups : null

  const handleToggleTask = async (task: MarkdownTask, checkedState: CheckedState) => {
    if (!vaultPath || !contentByPath) return

    const currentContent = contentByPath[task.path]
    if (typeof currentContent !== 'string') return

    const nextChecked = checkedState === true
    const updatedContent = toggleTaskCheckedInContent({
      content: currentContent,
      lineNumber: task.lineNumber,
      checked: nextChecked,
    })
    if (updatedContent === currentContent) return

    setSavingPaths((current) => new Set(current).add(task.path))
    try {
      await tauriCall<void>({
        command: 'save_note_content',
        tauriArgs: { path: task.path, content: updatedContent, vaultPath },
        mockArgs: { path: task.path, content: updatedContent },
      })
      setContentByPath((current) => (
        current ? { ...current, [task.path]: updatedContent } : current
      ))
      setLoadError(null)
      trackEvent('tasks_query_task_toggled', { checked: nextChecked ? 1 : 0 })
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setSavingPaths((current) => {
        const next = new Set(current)
        next.delete(task.path)
        return next
      })
    }
  }

  if (isLoading && !queryResult) return <LoadingState />

  if (loadError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {loadError}
      </div>
    )
  }

  if (!queryResult || queryResult.tasks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-sm text-muted-foreground">
        {translate(locale, 'noteList.empty.noMatchingItems')}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm">
      {groupedTasks
        ? groupedTasks.map((group) => (
          <section key={group.key} className="border-t border-border/60 first:border-t-0">
            <div className="bg-muted/35 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {renderTaskGroupKey(group.key, noteMetaByPath)}
            </div>
            {group.tasks.map((task) => (
              <TaskRow
                key={`${task.path}:${task.lineNumber}`}
                disabled={savingPaths.has(task.path)}
                noteMetaByPath={noteMetaByPath}
                onNavigateWikilink={onNavigateWikilink}
                onToggleTask={handleToggleTask}
                task={task}
              />
            ))}
          </section>
        ))
        : queryResult.tasks.map((task) => (
          <TaskRow
            key={`${task.path}:${task.lineNumber}`}
            disabled={savingPaths.has(task.path)}
            noteMetaByPath={noteMetaByPath}
            onNavigateWikilink={onNavigateWikilink}
            onToggleTask={handleToggleTask}
            task={task}
          />
        ))}
    </div>
  )
}