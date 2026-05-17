import { useCallback, useEffect, useRef, useState } from 'react'
import type { VaultEntry } from '../types'
import {
  beginNoteOpenTrace,
  failNoteOpenTrace,
  finishNoteOpenTrace,
  markNoteOpenTrace,
} from '../utils/noteOpenPerformance'
import {
  cacheNoteContent as cacheNoteContentInMemory,
  clearNoteContentCache,
  getCachedNoteContentEntry,
  hasResolvedCachedContent,
  isNoActiveVaultSelectedError,
  isUnreadableNoteContentError,
  loadContentForOpen,
  NOTE_CONTENT_CACHE_LIMIT,
  NOTE_CONTENT_CACHE_MAX_BYTES,
  NOTE_CONTENT_ENTRY_MAX_BYTES,
  NOTE_CONTENT_PREFETCH_CONCURRENCY,
  prefetchNoteContent as prefetchNoteContentInMemory,
} from './noteContentCache'
import { clearParsedNoteBlockCache } from './editorParsedBlockCache'
import { notePathsMatch } from '../utils/notePathIdentity'
import { normalizeVaultEntry } from '../utils/vaultMetadataNormalization'

interface Tab {
  entry: VaultEntry
  content: string
}

export {
  NOTE_CONTENT_CACHE_LIMIT,
  NOTE_CONTENT_CACHE_MAX_BYTES,
  NOTE_CONTENT_ENTRY_MAX_BYTES,
  NOTE_CONTENT_PREFETCH_CONCURRENCY,
}

export function prefetchNoteContent(target: string | VaultEntry): void {
  prefetchNoteContentInMemory(target)
}

export function cacheNoteContent(path: string, content: string, entry?: VaultEntry): void {
  cacheNoteContentInMemory(path, content, entry)
}

/** Clear note-open caches. Call on vault reload to prevent stale content. */
export function clearPrefetchCache(): void {
  clearNoteContentCache()
  clearParsedNoteBlockCache()
}

export type { Tab }

interface TabManagementResult {
  tabs: Tab[]
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
  activeTabPath: string | null
  activeTabPathRef: React.MutableRefObject<string | null>
  requestedActiveTabPathRef: React.MutableRefObject<string | null>
  handleSelectNote: (entry: VaultEntry) => Promise<void>
  openTabWithContent: (entry: VaultEntry, content: string) => void
  handleSwitchTab: (path: string) => void
  handleCloseTab: (path: string) => void
  handleReplaceActiveTab: (entry: VaultEntry) => Promise<void>
  closeAllTabs: () => void
}

interface TabManagementOptions {
  beforeNavigate?: (fromPath: string, toPath: string) => Promise<void>
  hasUnsavedChanges?: (path: string) => boolean
  onMissingActiveVault?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onMissingNotePath?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onUnreadableNoteContent?: (entry: VaultEntry, error: unknown) => void | Promise<void>
}

interface NavigateToEntryOptions {
  entry: VaultEntry
  sourceEntry?: VaultEntry
  forceReload?: boolean
  replaceFromPath?: string | null
  hasUnsavedChanges?: (path: string) => boolean
  loadSeqRef: React.MutableRefObject<number>
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  tabsRef: React.MutableRefObject<Tab[]>
  tabHistoryRef: React.MutableRefObject<string[]>
  activeTabPathRef: React.MutableRefObject<string | null>
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
  onMissingActiveVault?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onMissingNotePath?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onUnreadableNoteContent?: (entry: VaultEntry, error: unknown) => void | Promise<void>
}

function syncActiveTabPath(
  activeTabPathRef: React.MutableRefObject<string | null>,
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>,
  path: string | null,
) {
  activeTabPathRef.current = path
  setActiveTabPath(path)
}

function rememberTabAccess(
  tabHistoryRef: React.MutableRefObject<string[]>,
  path: string,
) {
  tabHistoryRef.current = [...tabHistoryRef.current.filter((candidate) => !notePathsMatch(candidate, path)), path]
}

function forgetTabAccess(
  tabHistoryRef: React.MutableRefObject<string[]>,
  path: string,
) {
  tabHistoryRef.current = tabHistoryRef.current.filter((candidate) => !notePathsMatch(candidate, path))
}

function syncActiveTabSelection(
  activeTabPathRef: React.MutableRefObject<string | null>,
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>,
  tabHistoryRef: React.MutableRefObject<string[]>,
  path: string | null,
) {
  syncActiveTabPath(activeTabPathRef, setActiveTabPath, path)
  if (path) rememberTabAccess(tabHistoryRef, path)
}

function resetRequestedPathIfStillPending(
  requestedActiveTabPathRef: React.MutableRefObject<string | null>,
  activeTabPathRef: React.MutableRefObject<string | null>,
  pendingPath: string,
) {
  if (requestedActiveTabPathRef.current === pendingPath) {
    requestedActiveTabPathRef.current = activeTabPathRef.current
  }
}

function syncTabsState(
  tabsRef: React.MutableRefObject<Tab[]>,
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
  nextTabs: Tab[],
) {
  tabsRef.current = nextTabs
  setTabs(nextTabs)
}

function applyTabsState(
  tabsRef: React.MutableRefObject<Tab[]>,
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
  update: (currentTabs: Tab[]) => Tab[],
) {
  const nextTabs = update(tabsRef.current)
  syncTabsState(tabsRef, setTabs, nextTabs)
  return nextTabs
}

function clearTabs(
  tabsRef: React.MutableRefObject<Tab[]>,
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
) {
  syncTabsState(tabsRef, setTabs, [])
}

function findMatchingTab(tabs: Tab[], path: string): Tab | undefined {
  return tabs.find((tab) => notePathsMatch(tab.entry.path, path))
}

function findMatchingTabPath(tabs: Tab[], path: string): string | null {
  return findMatchingTab(tabs, path)?.entry.path ?? null
}

function upsertTab(
  tabsRef: React.MutableRefObject<Tab[]>,
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
  nextTab: Tab,
  replaceFromPath?: string | null,
) {
  return applyTabsState(tabsRef, setTabs, (currentTabs) => {
    const filteredTabs = replaceFromPath
      ? currentTabs.filter((tab) => !notePathsMatch(tab.entry.path, replaceFromPath) || notePathsMatch(tab.entry.path, nextTab.entry.path))
      : currentTabs
    const existingIndex = filteredTabs.findIndex((tab) => notePathsMatch(tab.entry.path, nextTab.entry.path))

    if (existingIndex >= 0) {
      const updatedTabs = [...filteredTabs]
      updatedTabs[existingIndex] = nextTab
      return updatedTabs
    }

    return [...filteredTabs, nextTab]
  })
}

function removeTab(
  tabsRef: React.MutableRefObject<Tab[]>,
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>,
  path: string,
) {
  return applyTabsState(tabsRef, setTabs, (currentTabs) => currentTabs.filter((tab) => !notePathsMatch(tab.entry.path, path)))
}

function resolveFallbackActivePath(options: {
  tabsRef: React.MutableRefObject<Tab[]>
  tabHistoryRef: React.MutableRefObject<string[]>
  preferredPath?: string | null
}) {
  const { tabsRef, tabHistoryRef, preferredPath } = options

  if (preferredPath) {
    const preferredTab = findMatchingTab(tabsRef.current, preferredPath)
    if (preferredTab) return preferredTab.entry.path
  }

  for (let index = tabHistoryRef.current.length - 1; index >= 0; index -= 1) {
    const candidate = tabHistoryRef.current[index]
    const candidateTab = findMatchingTab(tabsRef.current, candidate)
    if (candidateTab) return candidateTab.entry.path
  }

  const lastTab = tabsRef.current[tabsRef.current.length - 1]
  return lastTab?.entry.path ?? null
}

function normalizeOpenEntry(entry: VaultEntry): VaultEntry | null {
  const path = typeof entry.path === 'string' ? entry.path.trim() : ''
  if (!path) return null
  return normalizeVaultEntry({ ...entry, path })
}

function callbackEntryForLoadFailure(entry: VaultEntry, sourceEntry?: VaultEntry): VaultEntry {
  return sourceEntry ? { ...sourceEntry, path: entry.path } : entry
}

function isAlreadyViewingPath(
  tabsRef: React.MutableRefObject<Tab[]>,
  activeTabPathRef: React.MutableRefObject<string | null>,
  path: string,
) {
  return notePathsMatch(activeTabPathRef.current, path)
    || tabsRef.current.some((tab) => notePathsMatch(tab.entry.path, path))
}

function startEntryNavigation(options: {
  entry: VaultEntry
  loadSeqRef: React.MutableRefObject<number>
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  activeTabPathRef: React.MutableRefObject<string | null>
  tabHistoryRef: React.MutableRefObject<string[]>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const {
    entry,
    loadSeqRef,
    pendingOpenPathsRef,
    latestLoadSeqByPathRef,
    activeTabPathRef,
    tabHistoryRef,
    setActiveTabPath,
  } = options

  const previousActivePath = activeTabPathRef.current
  const seq = ++loadSeqRef.current
  latestLoadSeqByPathRef.current.set(entry.path, seq)
  pendingOpenPathsRef.current.add(entry.path)

  const cachedEntry = getCachedNoteContentEntry(entry.path)
  syncActiveTabSelection(activeTabPathRef, setActiveTabPath, tabHistoryRef, entry.path)
  if (hasResolvedCachedContent(cachedEntry)) {
    markNoteOpenTrace(entry.path, 'cacheReady')
  }

  return { seq, cachedEntry, previousActivePath }
}

function openBinaryEntry(options: {
  entry: VaultEntry
  replaceFromPath?: string | null
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  tabsRef: React.MutableRefObject<Tab[]>
  tabHistoryRef: React.MutableRefObject<string[]>
  activeTabPathRef: React.MutableRefObject<string | null>
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const {
    entry,
    replaceFromPath,
    pendingOpenPathsRef,
    latestLoadSeqByPathRef,
    tabsRef,
    tabHistoryRef,
    activeTabPathRef,
    setTabs,
    setActiveTabPath,
  } = options

  pendingOpenPathsRef.current.delete(entry.path)
  latestLoadSeqByPathRef.current.delete(entry.path)
  if (replaceFromPath && !notePathsMatch(replaceFromPath, entry.path)) {
    forgetTabAccess(tabHistoryRef, replaceFromPath)
  }
  upsertTab(tabsRef, setTabs, { entry, content: '' }, replaceFromPath)
  syncActiveTabSelection(activeTabPathRef, setActiveTabPath, tabHistoryRef, entry.path)
  finishNoteOpenTrace(entry.path)
}

function isMissingNotePathError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : String(error)
  return /does not exist|not found|enoent/i.test(message)
}

function shouldApplyLoadedEntry(options: {
  seq: number
  path: string
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  tabsRef: React.MutableRefObject<Tab[]>
}) {
  const {
    seq,
    path,
    latestLoadSeqByPathRef,
    pendingOpenPathsRef,
    tabsRef,
  } = options

  if (latestLoadSeqByPathRef.current.get(path) !== seq) return false
  return pendingOpenPathsRef.current.has(path) || !!findMatchingTab(tabsRef.current, path)
}

type EntryLoadFailureKind =
  | 'missing-active-vault'
  | 'missing-path'
  | 'unreadable-content'
  | 'load-failed'

type RecoverableEntryLoadFailureKind = Exclude<EntryLoadFailureKind, 'load-failed'>

function getEntryLoadFailureKind(error: unknown): EntryLoadFailureKind {
  if (isNoActiveVaultSelectedError(error)) return 'missing-active-vault'
  if (isMissingNotePathError(error)) return 'missing-path'
  if (isUnreadableNoteContentError(error)) return 'unreadable-content'
  return 'load-failed'
}

function resetFailedEntrySelection(options: {
  failedPath: string
  previousActivePath: string | null
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  tabHistoryRef: React.MutableRefObject<string[]>
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  tabsRef: React.MutableRefObject<Tab[]>
  activeTabPathRef: React.MutableRefObject<string | null>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const {
    failedPath,
    previousActivePath,
    pendingOpenPathsRef,
    tabHistoryRef,
    latestLoadSeqByPathRef,
    tabsRef,
    activeTabPathRef,
    setActiveTabPath,
  } = options

  pendingOpenPathsRef.current.delete(failedPath)
  latestLoadSeqByPathRef.current.delete(failedPath)

  const openFailedTab = findMatchingTab(tabsRef.current, failedPath)
  if (!openFailedTab) {
    forgetTabAccess(tabHistoryRef, failedPath)
  }

  if (!notePathsMatch(activeTabPathRef.current, failedPath)) return

  const fallbackPath = openFailedTab?.entry.path ?? resolveFallbackActivePath({
    tabsRef,
    tabHistoryRef,
    preferredPath: previousActivePath,
  })
  syncActiveTabPath(activeTabPathRef, setActiveTabPath, fallbackPath)
}

function runEntryFailureCallback(options: {
  callback?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  entry: VaultEntry
  error: unknown
  warning: string
}) {
  const { callback, entry, error, warning } = options
  Promise.resolve(callback?.(entry, error)).catch((callbackError) => {
    console.warn(warning, callbackError)
  })
}

function handleRecoverableEntryLoadFailure(options: {
  kind: RecoverableEntryLoadFailureKind
  entry: VaultEntry
  callbackEntry: VaultEntry
  previousActivePath: string | null
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  tabHistoryRef: React.MutableRefObject<string[]>
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  tabsRef: React.MutableRefObject<Tab[]>
  activeTabPathRef: React.MutableRefObject<string | null>
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
  error: unknown
  onMissingActiveVault?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onMissingNotePath?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onUnreadableNoteContent?: (entry: VaultEntry, error: unknown) => void | Promise<void>
}) {
  const {
    kind,
    entry,
    callbackEntry,
    previousActivePath,
    pendingOpenPathsRef,
    tabHistoryRef,
    latestLoadSeqByPathRef,
    tabsRef,
    activeTabPathRef,
    setTabs,
    setActiveTabPath,
    error,
    onMissingActiveVault,
    onMissingNotePath,
    onUnreadableNoteContent,
  } = options

  if (kind === 'missing-active-vault') {
    clearPrefetchCache()
    pendingOpenPathsRef.current.clear()
    latestLoadSeqByPathRef.current.clear()
    tabHistoryRef.current = []
    clearTabs(tabsRef, setTabs)
    syncActiveTabPath(activeTabPathRef, setActiveTabPath, null)
    failNoteOpenTrace(entry.path, kind)

    runEntryFailureCallback({
      callback: onMissingActiveVault,
      entry: callbackEntry,
      error,
      warning: 'Failed to handle missing active vault:',
    })
    return
  }

  if (findMatchingTab(tabsRef.current, entry.path)) {
    removeTab(tabsRef, setTabs, entry.path)
    forgetTabAccess(tabHistoryRef, entry.path)
  }

  resetFailedEntrySelection({
    failedPath: entry.path,
    previousActivePath,
    pendingOpenPathsRef,
    tabHistoryRef,
    latestLoadSeqByPathRef,
    tabsRef,
    activeTabPathRef,
    setActiveTabPath,
  })
  failNoteOpenTrace(entry.path, kind)

  if (kind === 'missing-path') {
    runEntryFailureCallback({
      callback: onMissingNotePath,
      entry: callbackEntry,
      error,
      warning: 'Failed to handle missing note path:',
    })
    return
  }

  if (kind === 'unreadable-content') {
    runEntryFailureCallback({
      callback: onUnreadableNoteContent,
      entry: callbackEntry,
      error,
      warning: 'Failed to handle unreadable note content:',
    })
  }
}

function handleEntryLoadFailure(options: {
  entry: VaultEntry
  callbackEntry: VaultEntry
  previousActivePath: string | null
  seq: number
  pendingOpenPathsRef: React.MutableRefObject<Set<string>>
  latestLoadSeqByPathRef: React.MutableRefObject<Map<string, number>>
  tabHistoryRef: React.MutableRefObject<string[]>
  tabsRef: React.MutableRefObject<Tab[]>
  activeTabPathRef: React.MutableRefObject<string | null>
  setTabs: React.Dispatch<React.SetStateAction<Tab[]>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
  error: unknown
  onMissingActiveVault?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onMissingNotePath?: (entry: VaultEntry, error: unknown) => void | Promise<void>
  onUnreadableNoteContent?: (entry: VaultEntry, error: unknown) => void | Promise<void>
}) {
  const {
    entry,
    callbackEntry,
    previousActivePath,
    seq,
    pendingOpenPathsRef,
    latestLoadSeqByPathRef,
    tabHistoryRef,
    tabsRef,
    activeTabPathRef,
    setTabs,
    setActiveTabPath,
    error,
    onMissingActiveVault,
    onMissingNotePath,
    onUnreadableNoteContent,
  } = options

  console.warn('Failed to load note content:', error)
  if (latestLoadSeqByPathRef.current.get(entry.path) !== seq) return

  const failureKind = getEntryLoadFailureKind(error)
  if (failureKind !== 'load-failed') {
    handleRecoverableEntryLoadFailure({
      kind: failureKind,
      entry,
      callbackEntry,
      previousActivePath,
      pendingOpenPathsRef,
      tabHistoryRef,
      latestLoadSeqByPathRef,
      tabsRef,
      activeTabPathRef,
      setTabs,
      setActiveTabPath,
      error,
      onMissingActiveVault,
      onMissingNotePath,
      onUnreadableNoteContent,
    })
    return
  }

  resetFailedEntrySelection({
    failedPath: entry.path,
    previousActivePath,
    pendingOpenPathsRef,
    tabHistoryRef,
    latestLoadSeqByPathRef,
    tabsRef,
    activeTabPathRef,
    setActiveTabPath,
  })
  failNoteOpenTrace(entry.path, 'load-failed')
}

function focusAlreadyOpenEntry({
  entry,
  replaceFromPath,
  hasUnsavedChanges,
  tabsRef,
  tabHistoryRef,
  activeTabPathRef,
  setTabs,
  setActiveTabPath,
}: Pick<NavigateToEntryOptions, 'entry' | 'replaceFromPath' | 'hasUnsavedChanges' | 'tabsRef' | 'tabHistoryRef' | 'activeTabPathRef' | 'setTabs' | 'setActiveTabPath'>): boolean {
  if (!isAlreadyViewingPath(tabsRef, activeTabPathRef, entry.path)) return false

  const isActivePath = notePathsMatch(activeTabPathRef.current, entry.path)
  if (isActivePath && !replaceFromPath && !hasUnsavedChanges?.(entry.path)) {
    return false
  }

  if (replaceFromPath && !notePathsMatch(replaceFromPath, entry.path)) {
    removeTab(tabsRef, setTabs, replaceFromPath)
    forgetTabAccess(tabHistoryRef, replaceFromPath)
  }

  const resolvedPath = findMatchingTabPath(tabsRef.current, entry.path) ?? entry.path
  syncActiveTabSelection(activeTabPathRef, setActiveTabPath, tabHistoryRef, resolvedPath)
  finishNoteOpenTrace(entry.path)
  return true
}

async function loadTextEntry(options: Required<Pick<NavigateToEntryOptions, 'forceReload'>> & NavigateToEntryOptions) {
  const {
    entry,
    sourceEntry,
    forceReload,
    replaceFromPath,
    loadSeqRef,
    pendingOpenPathsRef,
    latestLoadSeqByPathRef,
    tabsRef,
    tabHistoryRef,
    activeTabPathRef,
    setTabs,
    setActiveTabPath,
    onMissingActiveVault,
    onMissingNotePath,
    onUnreadableNoteContent,
  } = options

  const { seq, cachedEntry, previousActivePath } = startEntryNavigation({
    entry,
    loadSeqRef,
    pendingOpenPathsRef,
    latestLoadSeqByPathRef,
    activeTabPathRef,
    tabHistoryRef,
    setActiveTabPath,
  })

  try {
    markNoteOpenTrace(entry.path, 'contentLoadStart')
    const content = await loadContentForOpen({
      entry,
      forceReload,
      cachedEntry,
    })
    markNoteOpenTrace(entry.path, 'contentLoadEnd')

    if (!shouldApplyLoadedEntry({
      seq,
      path: entry.path,
      latestLoadSeqByPathRef,
      pendingOpenPathsRef,
      tabsRef,
    })) {
      return
    }

    pendingOpenPathsRef.current.delete(entry.path)
    latestLoadSeqByPathRef.current.delete(entry.path)
    if (replaceFromPath && !notePathsMatch(replaceFromPath, entry.path)) {
      forgetTabAccess(tabHistoryRef, replaceFromPath)
    }
    upsertTab(tabsRef, setTabs, { entry, content }, replaceFromPath)
    finishNoteOpenTrace(entry.path)
  } catch (err) {
    handleEntryLoadFailure({
      entry,
      callbackEntry: callbackEntryForLoadFailure(entry, sourceEntry),
      previousActivePath,
      seq,
      pendingOpenPathsRef,
      latestLoadSeqByPathRef,
      tabHistoryRef,
      tabsRef,
      activeTabPathRef,
      setTabs,
      setActiveTabPath,
      error: err,
      onMissingActiveVault,
      onMissingNotePath,
      onUnreadableNoteContent,
    })
  }
}

async function navigateToEntry(options: NavigateToEntryOptions) {
  const forceReload = options.forceReload ?? false

  if (options.entry.fileKind === 'binary') {
    openBinaryEntry(options)
    return
  }

  if (!forceReload && focusAlreadyOpenEntry(options)) return

  await loadTextEntry({ ...options, forceReload })
}

export function useTabManagement(options: TabManagementOptions = {}): TabManagementResult {
  const [tabs, setTabsState] = useState<Tab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const activeTabPathRef = useRef(activeTabPath)
  const requestedActiveTabPathRef = useRef<string | null>(activeTabPath)
  useEffect(() => { activeTabPathRef.current = activeTabPath }, [activeTabPath])

  const tabsRef = useRef<Tab[]>(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  const tabHistoryRef = useRef<string[]>([])
  const loadSeqRef = useRef(0)
  const pendingOpenPathsRef = useRef<Set<string>>(new Set())
  const latestLoadSeqByPathRef = useRef<Map<string, number>>(new Map())
  const beforeNavigateSeqRef = useRef(0)

  const beforeNavigate = options.beforeNavigate
  const hasUnsavedChanges = options.hasUnsavedChanges
  const onMissingActiveVault = options.onMissingActiveVault
  const onMissingNotePath = options.onMissingNotePath
  const onUnreadableNoteContent = options.onUnreadableNoteContent

  const setTabs: React.Dispatch<React.SetStateAction<Tab[]>> = useCallback((nextTabs) => {
    setTabsState((currentTabs) => {
      const resolvedTabs = typeof nextTabs === 'function'
        ? (nextTabs as (currentTabs: Tab[]) => Tab[])(currentTabs)
        : nextTabs
      tabsRef.current = resolvedTabs
      return resolvedTabs
    })
  }, [])

  const runBeforeNavigate = useCallback(async (
    fromPath: string | null,
    toPath: string,
    config: { force?: boolean } = {},
  ) => {
    const seq = ++beforeNavigateSeqRef.current
    if (!beforeNavigate || !fromPath) return true
    if (!config.force && notePathsMatch(fromPath, toPath)) return true

    try {
      markNoteOpenTrace(toPath, 'beforeNavigateStart')
      await beforeNavigate(fromPath, toPath)
      markNoteOpenTrace(toPath, 'beforeNavigateEnd')
    } catch (err) {
      console.warn('Failed to persist note before navigation:', err)
      failNoteOpenTrace(toPath, 'before-navigate-failed')
      return false
    }

    return beforeNavigateSeqRef.current === seq
  }, [beforeNavigate])

  const executeNavigationWithBoundary = useCallback(async (
    targetPath: string,
    navigate: () => void | Promise<void>,
  ) => {
    const currentPath = activeTabPathRef.current
    if (!beforeNavigate || !currentPath || notePathsMatch(currentPath, targetPath)) {
      await navigate()
      return true
    }

    const navigable = await runBeforeNavigate(currentPath, targetPath)
    if (!navigable) return false
    await navigate()
    return true
  }, [beforeNavigate, runBeforeNavigate])

  const handleSelectNote = useCallback(async (entry: VaultEntry) => {
    const openEntry = normalizeOpenEntry(entry)
    if (!openEntry) return

    requestedActiveTabPathRef.current = openEntry.path
    if (!notePathsMatch(openEntry.path, activeTabPathRef.current)) {
      beginNoteOpenTrace(openEntry.path, 'select-note')
    }

    const navigated = await executeNavigationWithBoundary(openEntry.path, () => navigateToEntry({
      entry: openEntry,
      sourceEntry: entry,
      hasUnsavedChanges,
      loadSeqRef,
      pendingOpenPathsRef,
      latestLoadSeqByPathRef,
      tabsRef,
      tabHistoryRef,
      activeTabPathRef,
      setTabs,
      setActiveTabPath,
      onMissingActiveVault,
      onMissingNotePath,
      onUnreadableNoteContent,
    }))

    if (!navigated) {
      resetRequestedPathIfStillPending(requestedActiveTabPathRef, activeTabPathRef, openEntry.path)
    }
  }, [executeNavigationWithBoundary, hasUnsavedChanges, onMissingActiveVault, onMissingNotePath, onUnreadableNoteContent, setTabs])

  const handleSwitchTab = useCallback((path: string) => {
    const matchingPath = findMatchingTabPath(tabsRef.current, path)
    if (!matchingPath) return

    requestedActiveTabPathRef.current = matchingPath
    void executeNavigationWithBoundary(matchingPath, async () => {
      syncActiveTabSelection(activeTabPathRef, setActiveTabPath, tabHistoryRef, matchingPath)
    }).then((navigated) => {
      if (!navigated) {
        resetRequestedPathIfStillPending(requestedActiveTabPathRef, activeTabPathRef, matchingPath)
      }
    })
  }, [executeNavigationWithBoundary])

  const handleCloseTab = useCallback((path: string) => {
    const closingTabPath = findMatchingTabPath(tabsRef.current, path)
    if (!closingTabPath) return

    const isClosingActiveTab = notePathsMatch(activeTabPathRef.current, closingTabPath)
    const remainingTabs = tabsRef.current.filter((tab) => !notePathsMatch(tab.entry.path, closingTabPath))
    const remainingHistory = tabHistoryRef.current.filter((candidate) => !notePathsMatch(candidate, closingTabPath))
    const nextActivePath = isClosingActiveTab
      ? resolveFallbackActivePath({
        tabsRef: { current: remainingTabs },
        tabHistoryRef: { current: remainingHistory },
      })
      : activeTabPathRef.current

    const finishClose = () => {
      pendingOpenPathsRef.current.delete(closingTabPath)
      latestLoadSeqByPathRef.current.delete(closingTabPath)
      removeTab(tabsRef, setTabs, closingTabPath)
      forgetTabAccess(tabHistoryRef, closingTabPath)
      if (!isClosingActiveTab) return

      requestedActiveTabPathRef.current = nextActivePath
      syncActiveTabPath(activeTabPathRef, setActiveTabPath, nextActivePath)
    }

    if (!isClosingActiveTab) {
      finishClose()
      return
    }

    requestedActiveTabPathRef.current = nextActivePath
    if (!beforeNavigate || !activeTabPathRef.current) {
      finishClose()
      return
    }

    void runBeforeNavigate(activeTabPathRef.current, nextActivePath ?? closingTabPath, { force: true }).then((navigated) => {
      if (!navigated) {
        requestedActiveTabPathRef.current = activeTabPathRef.current
        return
      }
      finishClose()
    })
  }, [beforeNavigate, runBeforeNavigate, setTabs])

  /** Open a tab with known content — no IPC round-trip. Used for newly created notes. */
  const openTabWithContent = useCallback((entry: VaultEntry, content: string) => {
    const openEntry = normalizeOpenEntry(entry)
    if (!openEntry) return

    requestedActiveTabPathRef.current = openEntry.path
    void executeNavigationWithBoundary(openEntry.path, () => {
      cacheNoteContent(openEntry.path, content, openEntry)
      pendingOpenPathsRef.current.delete(openEntry.path)
      latestLoadSeqByPathRef.current.delete(openEntry.path)
      upsertTab(tabsRef, setTabs, { entry: openEntry, content })
      syncActiveTabSelection(activeTabPathRef, setActiveTabPath, tabHistoryRef, openEntry.path)
    }).then((navigated) => {
      if (!navigated) {
        resetRequestedPathIfStillPending(requestedActiveTabPathRef, activeTabPathRef, openEntry.path)
      }
    })
  }, [executeNavigationWithBoundary, setTabs])

  const handleReplaceActiveTab = useCallback(async (entry: VaultEntry) => {
    const openEntry = normalizeOpenEntry(entry)
    if (!openEntry) return

    requestedActiveTabPathRef.current = openEntry.path
    const replaceFromPath = activeTabPathRef.current
    const replacingDifferentEntry = !replaceFromPath || !notePathsMatch(openEntry.path, replaceFromPath)
    if (replacingDifferentEntry) {
      beginNoteOpenTrace(openEntry.path, 'replace-active-tab')
    }

    const navigated = await executeNavigationWithBoundary(openEntry.path, () => navigateToEntry({
      entry: openEntry,
      sourceEntry: entry,
      forceReload: !replacingDifferentEntry,
      replaceFromPath,
      loadSeqRef,
      pendingOpenPathsRef,
      latestLoadSeqByPathRef,
      tabsRef,
      tabHistoryRef,
      activeTabPathRef,
      setTabs,
      setActiveTabPath,
      onMissingActiveVault,
      onMissingNotePath,
      onUnreadableNoteContent,
    }))

    if (!navigated) {
      resetRequestedPathIfStillPending(requestedActiveTabPathRef, activeTabPathRef, openEntry.path)
    }
  }, [executeNavigationWithBoundary, onMissingActiveVault, onMissingNotePath, onUnreadableNoteContent, setTabs])

  const closeAllTabs = useCallback(() => {
    loadSeqRef.current += 1
    beforeNavigateSeqRef.current += 1
    pendingOpenPathsRef.current.clear()
    latestLoadSeqByPathRef.current.clear()
    tabHistoryRef.current = []
    clearTabs(tabsRef, setTabs)
    requestedActiveTabPathRef.current = null
    syncActiveTabPath(activeTabPathRef, setActiveTabPath, null)
  }, [setTabs])

  return {
    tabs,
    setTabs,
    activeTabPath,
    activeTabPathRef,
    requestedActiveTabPathRef,
    handleSelectNote,
    openTabWithContent,
    handleSwitchTab,
    handleCloseTab,
    handleReplaceActiveTab,
    closeAllTabs,
  }
}