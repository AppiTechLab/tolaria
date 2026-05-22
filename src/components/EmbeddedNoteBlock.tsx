import { useContext, useEffect, useMemo, useState } from 'react'
import { canonicalWikilinkTargetForEntry, resolveEntry, wikilinkDisplay } from '../utils/wikilink'
import { getCachedNoteContentEntry, loadContentForOpen } from '../hooks/noteContentCache'
import { extractEditorBody } from '../hooks/editorTabContent'
import { translate } from '../lib/i18n'
import { MarkdownContent } from './MarkdownContent'
import { TasksBlockContext } from './tasksBlockContext'
import { Button } from './ui/button'

interface EmbeddedNoteBlockProps {
  source: string
  target: string
}

interface EmbeddedNoteLoadState {
  bodyMarkdown: string
  status: 'idle' | 'loaded' | 'unavailable'
  targetPath: string | null
}

function stripLeadingH1(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const lines = normalized.split('\n')
  if (!/^#\s+\S/u.test(lines[0]?.trim() ?? '')) return normalized

  let index = 1
  while (index < lines.length && lines[index].trim() === '') index++
  return lines.slice(index).join('\n').trim()
}

function embeddedNoteBody(content: string): string {
  return stripLeadingH1(extractEditorBody(content))
}

function fallbackTitle(source: string, target: string): string {
  if (source.startsWith('![[') && source.endsWith(']]')) {
    return wikilinkDisplay(source.slice(1))
  }
  return wikilinkDisplay(`[[${target}]]`)
}

function rawNavigationTarget(target: string): string {
  const pipeIndex = target.indexOf('|')
  return pipeIndex === -1 ? target : target.slice(0, pipeIndex)
}

export function EmbeddedNoteBlock({ source, target }: EmbeddedNoteBlockProps) {
  const { entries, locale, onNavigateWikilink, sourceEntry, vaultPath } = useContext(TasksBlockContext)
  const [loadState, setLoadState] = useState<EmbeddedNoteLoadState>({
    bodyMarkdown: '',
    status: 'idle',
    targetPath: null,
  })

  const targetEntry = useMemo(
    () => resolveEntry(entries, target, sourceEntry),
    [entries, sourceEntry, target],
  )
  const title = targetEntry?.title ?? fallbackTitle(source, target)
  const navigationTarget = useMemo(() => {
    if (targetEntry && vaultPath) {
      return canonicalWikilinkTargetForEntry(targetEntry, vaultPath, sourceEntry)
    }
    return rawNavigationTarget(target)
  }, [sourceEntry, target, targetEntry, vaultPath])
  const displayedBodyMarkdown = targetEntry && loadState.targetPath === targetEntry.path && loadState.status === 'loaded'
    ? loadState.bodyMarkdown
    : ''
  const isLoading = Boolean(targetEntry) && loadState.targetPath !== targetEntry.path
  const isUnavailable = !targetEntry
    || (Boolean(targetEntry) && loadState.targetPath === targetEntry.path && loadState.status === 'unavailable')

  useEffect(() => {
    let canceled = false

    if (!targetEntry) return () => {
      canceled = true
    }

    const targetPath = targetEntry.path

    loadContentForOpen({
      entry: targetEntry,
      forceReload: false,
      cachedEntry: getCachedNoteContentEntry(targetEntry.path),
    })
      .then((content) => {
        if (canceled) return
        setLoadState({
          bodyMarkdown: embeddedNoteBody(content),
          status: 'loaded',
          targetPath,
        })
      })
      .catch(() => {
        if (canceled) return
        setLoadState({
          bodyMarkdown: '',
          status: 'unavailable',
          targetPath,
        })
      })

    return () => {
      canceled = true
    }
  }, [targetEntry])

  return (
    <section className="my-3 overflow-hidden rounded-lg border border-border/70 bg-background/80 shadow-sm" data-testid="embedded-note-block">
      <div className="flex items-center border-b border-border/60 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          className="h-auto justify-start px-0 py-0 text-left font-medium text-foreground hover:bg-transparent"
          onClick={() => onNavigateWikilink(navigationTarget)}
        >
          {title}
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2 px-3 py-3" data-testid="embedded-note-loading">
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
        </div>
      )}

      {!isLoading && isUnavailable && (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          {translate(locale, 'editor.embed.unavailable')}
        </div>
      )}

      {!isLoading && !isUnavailable && displayedBodyMarkdown && (
        <div className="px-3 py-3">
          <MarkdownContent content={displayedBodyMarkdown} onWikilinkClick={onNavigateWikilink} renderTaskBlocks />
        </div>
      )}

      {!isLoading && !isUnavailable && !displayedBodyMarkdown && (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          {translate(locale, 'editor.embed.empty')}
        </div>
      )}
    </section>
  )
}