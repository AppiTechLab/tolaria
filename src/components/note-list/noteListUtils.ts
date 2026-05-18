import type {
  FilterGroup,
  LabHomeGroupId,
  ModifiedFile,
  NoteStatus,
  ResearchLabDomainKey,
  ResearchLabWorkspaceViewId,
  SelectedWorkspaceView,
  SidebarFilter,
  SidebarSelection,
  VaultEntry,
  ViewFile,
} from '../../types'
import type { RelationshipGroup } from '../../utils/noteListHelpers'
import { translate, type AppLocale, type TranslationKey } from '../../lib/i18n'
import { filenameStemToTitle } from '../../utils/noteTitle'
import { evaluateFilterGroup } from '../../utils/viewFilters'

export interface DeletedNoteEntry extends VaultEntry {
  __deletedNotePreview: true
  __deletedRelativePath: string
  __changeAddedLines: number | null
  __changeDeletedLines: number | null
  __changeBinary: boolean
}

const FILTER_TITLE_KEYS = {
  archived: 'noteList.title.archive',
  changes: 'noteList.title.changes',
  inbox: 'noteList.title.inbox',
  pulse: 'noteList.title.history',
} as const

const LAB_DOMAIN_TITLE_KEYS: Record<ResearchLabDomainKey, TranslationKey> = {
  ongoingProjects: 'labHome.section.ongoingProjects.title',
  projectAcquisition: 'labHome.section.projectAcquisition.title',
  teaching: 'labHome.section.teaching.title',
  labManagement: 'labHome.section.labManagement.title',
}

const LAB_DOMAIN_SEARCH_PLACEHOLDER_KEYS: Record<ResearchLabDomainKey, TranslationKey> = {
  ongoingProjects: 'noteList.searchPlaceholderProjects',
  projectAcquisition: 'noteList.searchPlaceholderAcquisition',
  teaching: 'noteList.searchPlaceholderTeaching',
  labManagement: 'noteList.searchPlaceholderLabManagement',
}

export interface WorkspaceViewShortcut {
  id: string
  label: string
  filters: FilterGroup
}

interface WorkspaceViewShortcutDefinition {
  id: ResearchLabWorkspaceViewId
  labelKey: TranslationKey
  filters: FilterGroup
}

interface WorkspaceViewSemanticMatch {
  fields: readonly string[]
  values: readonly unknown[]
  op?: 'contains'
}

const WORKSPACE_VIEW_IDENTIFIER_FIELDS = [
  'Workspace View',
  'Workspace View Id',
  'workspace_view',
  'workspaceView',
] as const

function uniqueValues<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

function humanizeWorkspaceViewId(id: ResearchLabWorkspaceViewId): string {
  return id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function workspaceViewIdentifierValues(
  id: ResearchLabWorkspaceViewId,
  aliases: readonly string[] = [],
): string[] {
  const humanized = humanizeWorkspaceViewId(id)
  return uniqueValues([
    id,
    humanized,
    humanized.replace(/\s+/g, '-'),
    humanized.replace(/\s+/g, '_'),
    ...aliases,
  ])
}

function buildFieldValueFilter(fields: readonly string[], values: readonly unknown[]): FilterGroup {
  const resolvedValues = uniqueValues(values)
  return {
    any: fields.map((field) => (
      resolvedValues.length === 1
        ? { field, op: 'equals' as const, value: resolvedValues[0] }
        : { field, op: 'any_of' as const, value: resolvedValues }
    )),
  }
}

function buildSemanticMatchFilter(match: WorkspaceViewSemanticMatch): FilterGroup {
  if (match.op === 'contains') {
    return {
      any: match.fields.flatMap((field) => match.values.map((value) => ({
        field,
        op: 'contains' as const,
        value,
      }))),
    }
  }

  return buildFieldValueFilter(match.fields, match.values)
}

function createWorkspaceViewShortcut(
  id: ResearchLabWorkspaceViewId,
  labelKey: TranslationKey,
  aliases: readonly string[] = [],
  semanticMatches: readonly WorkspaceViewSemanticMatch[] = [],
): WorkspaceViewShortcutDefinition {
  return {
    id,
    labelKey,
    filters: {
      any: [
        buildFieldValueFilter(WORKSPACE_VIEW_IDENTIFIER_FIELDS, workspaceViewIdentifierValues(id, aliases)),
        ...semanticMatches.map((match) => buildSemanticMatchFilter(match)),
      ],
    },
  }
}

const LAB_DOMAIN_WORKSPACE_VIEW_SHORTCUTS: Record<ResearchLabDomainKey, readonly WorkspaceViewShortcutDefinition[]> = {
  ongoingProjects: [
    createWorkspaceViewShortcut('active', 'noteList.workspaceView.ongoingProjects.active', ['Active'], [
      { fields: ['status'], values: ['Active', 'In Progress'] },
    ]),
    createWorkspaceViewShortcut('deliverables', 'noteList.workspaceView.ongoingProjects.deliverables', ['Deliverable', 'Deliverables'], [
      { fields: ['type', 'Category'], values: ['Deliverable', 'Deliverables'] },
    ]),
    createWorkspaceViewShortcut('meetings', 'noteList.workspaceView.ongoingProjects.meetings', ['Meeting', 'Meetings'], [
      { fields: ['type', 'Category'], values: ['Meeting', 'Meetings', 'Event'] },
    ]),
    createWorkspaceViewShortcut('risks', 'noteList.workspaceView.ongoingProjects.risks', ['Risk', 'Risks'], [
      { fields: ['type', 'Category'], values: ['Risk', 'Risks'] },
    ]),
    createWorkspaceViewShortcut('decisions', 'noteList.workspaceView.ongoingProjects.decisions', ['Decision', 'Decisions'], [
      { fields: ['type', 'Category'], values: ['Decision', 'Decisions'] },
    ]),
    createWorkspaceViewShortcut('archived', 'noteList.workspaceView.ongoingProjects.archived', ['Archived', 'Archive'], [
      { fields: ['status', 'Stage', 'Category'], values: ['Archived', 'Archive'] },
      { fields: ['archived'], values: [true] },
    ]),
  ],
  projectAcquisition: [
    createWorkspaceViewShortcut('ideas', 'noteList.workspaceView.projectAcquisition.ideas', ['Idea', 'Ideas'], [
      { fields: ['Stage', 'status', 'Category'], values: ['Idea', 'Ideas'] },
    ]),
    createWorkspaceViewShortcut('calls', 'noteList.workspaceView.projectAcquisition.calls', ['Call', 'Calls'], [
      { fields: ['type', 'Stage', 'Category'], values: ['Call', 'Calls'] },
    ]),
    createWorkspaceViewShortcut('drafting', 'noteList.workspaceView.projectAcquisition.drafting', ['Draft', 'Drafting'], [
      { fields: ['Stage', 'status'], values: ['Draft', 'Drafting'] },
    ]),
    createWorkspaceViewShortcut('submitted', 'noteList.workspaceView.projectAcquisition.submitted', ['Submitted'], [
      { fields: ['Stage', 'status'], values: ['Submitted'] },
    ]),
    createWorkspaceViewShortcut('rejected', 'noteList.workspaceView.projectAcquisition.rejected', ['Rejected'], [
      { fields: ['Stage', 'status'], values: ['Rejected'] },
    ]),
    createWorkspaceViewShortcut('resubmissionCandidates', 'noteList.workspaceView.projectAcquisition.resubmissionCandidates', ['Resubmission Candidate', 'Resubmission Candidates'], [
      { fields: ['Stage', 'status', 'Category'], values: ['Resubmission Candidate', 'Resubmission Candidates'] },
    ]),
  ],
  teaching: [
    createWorkspaceViewShortcut('currentSemester', 'noteList.workspaceView.teaching.currentSemester', ['Current Semester', 'Current'], [
      { fields: ['Semester', 'Academic Term', 'Term', 'status'], values: ['Current', 'Current Semester', 'Active'] },
    ]),
    createWorkspaceViewShortcut('courses', 'noteList.workspaceView.teaching.courses', ['Course', 'Courses'], [
      { fields: ['type', 'Category'], values: ['Course', 'Courses'] },
    ]),
    createWorkspaceViewShortcut('sessions', 'noteList.workspaceView.teaching.sessions', ['Session', 'Sessions'], [
      { fields: ['type', 'Category'], values: ['Session', 'Sessions'] },
    ]),
    createWorkspaceViewShortcut('exams', 'noteList.workspaceView.teaching.exams', ['Exam', 'Exams'], [
      { fields: ['type', 'Category'], values: ['Exam', 'Exams'] },
    ]),
    createWorkspaceViewShortcut('BachelorThesis', 'noteList.workspaceView.teaching.studentProjects', ['Bachelor Thesis', 'Bachelor Theses'], [
      { fields: ['type', 'Category'], values: ['Bachelor Thesis', 'Bachelor Theses'] },
    ]),
    createWorkspaceViewShortcut('rubrics', 'noteList.workspaceView.teaching.rubrics', ['Rubric', 'Rubrics'], [
      { fields: ['type', 'Category'], values: ['Rubric', 'Rubrics'] },
    ]),
  ],
  labManagement: [
    createWorkspaceViewShortcut('groupMeeting', 'noteList.workspaceView.labManagement.groupMeeting' as TranslationKey, ['GroupMeeting'], [
      { fields: ['type', 'Category'], values: ['groupMeeting', 'GroupMeeting', 'Group Meeting'] },
      { fields: ['body'], values: ['Weekly group meeting'], op: 'contains' },
    ]),
    createWorkspaceViewShortcut('equipment', 'noteList.workspaceView.labManagement.equipment', ['Equipment'], [
      { fields: ['type', 'Category'], values: ['Equipment'] },
    ]),
    createWorkspaceViewShortcut('procedures', 'noteList.workspaceView.labManagement.procedures', ['Procedure', 'Procedures'], [
      { fields: ['type', 'Category'], values: ['Procedure', 'Procedures'] },
    ]),
    createWorkspaceViewShortcut('strategy', 'noteList.workspaceView.labManagement.strategy', ['Strategy'], [
      { fields: ['type', 'Category'], values: ['Strategy'] },
    ]),
    createWorkspaceViewShortcut('infrastructure', 'noteList.workspaceView.labManagement.infrastructure', ['Infrastructure'], [
      { fields: ['type', 'Category'], values: ['Infrastructure'] },
    ]),
    createWorkspaceViewShortcut('finance', 'noteList.workspaceView.labManagement.finance', ['Finance'], [
      { fields: ['type', 'Category'], values: ['Finance'] },
    ]),
  ],
}

type LocalizedFilter = keyof typeof FILTER_TITLE_KEYS

function isLocalizedFilter(filter: SidebarFilter): filter is LocalizedFilter {
  return filter in FILTER_TITLE_KEYS
}

function resolveSelectionFilterTitle(selection: SidebarSelection, locale: AppLocale): string | null {
  if (selection.kind !== 'filter') return null
  if (!isLocalizedFilter(selection.filter)) return null
  return translate(locale, FILTER_TITLE_KEYS[selection.filter])
}

export function resolveHeaderTitle(
  selection: SidebarSelection,
  typeDocument: VaultEntry | null,
  views?: ViewFile[],
  locale: AppLocale = 'en',
  researchLabModeEnabled = false,
  selectedLabDomain: ResearchLabDomainKey | null = null,
): string {
  if (selection.kind === 'view') {
    const view = views?.find((v) => v.filename === selection.filename)
    return view?.definition.name ?? translate(locale, 'noteList.title.view')
  }
  if (selection.kind === 'entity') return selection.entry.title
  if (typeDocument) return typeDocument.title
  if (researchLabModeEnabled && selectedLabDomain && selection.kind === 'folder') {
    return translate(locale, LAB_DOMAIN_TITLE_KEYS[selectedLabDomain])
  }
  if (
    researchLabModeEnabled
    && selection.kind === 'filter'
    && (selection.filter === 'all' || selection.filter === 'inbox')
  ) {
    return translate(locale, 'noteList.title.workspace')
  }

  return resolveSelectionFilterTitle(selection, locale) ?? translate(locale, 'noteList.title.notes')
}

export function resolveSearchPlaceholder(
  locale: AppLocale = 'en',
  researchLabModeEnabled = false,
  selectedLabDomain: ResearchLabDomainKey | null = null,
): string {
  if (!researchLabModeEnabled) return translate(locale, 'noteList.searchPlaceholder')
  if (!selectedLabDomain) return translate(locale, 'noteList.searchPlaceholderWorkspace')
  return translate(locale, LAB_DOMAIN_SEARCH_PLACEHOLDER_KEYS[selectedLabDomain])
}

export function resolveWorkspaceViewShortcuts(
  selectedLabHomeGroupId: LabHomeGroupId | null = null,
  selectedLabDomain: ResearchLabDomainKey | null = null,
  views: readonly ViewFile[] = [],
  locale: AppLocale = 'en',
): readonly WorkspaceViewShortcut[] {
  if (!selectedLabHomeGroupId) return []
  const assignedViews = views
    .filter((view) => view.definition.labHomeGroup === selectedLabHomeGroupId)
    .sort((left, right) => {
      const order = (left.definition.order ?? Number.MAX_SAFE_INTEGER)
        - (right.definition.order ?? Number.MAX_SAFE_INTEGER)
      return order !== 0 ? order : left.filename.localeCompare(right.filename)
    })

  if (assignedViews.length > 0) {
    return assignedViews.map((view) => ({
      id: view.filename,
      label: view.definition.name,
      filters: view.definition.filters,
    }))
  }

  if (!selectedLabDomain) return []

  return LAB_DOMAIN_WORKSPACE_VIEW_SHORTCUTS[selectedLabDomain].map((shortcut) => ({
    id: shortcut.id,
    label: translate(locale, shortcut.labelKey),
    filters: shortcut.filters,
  }))
}

function resolveActiveWorkspaceViewShortcut(
  selection: SidebarSelection,
  selectedLabHomeGroupId: LabHomeGroupId | null,
  selectedLabDomain: ResearchLabDomainKey | null,
  selectedWorkspaceView: SelectedWorkspaceView | null,
  views: readonly ViewFile[] = [],
): WorkspaceViewShortcut | null {
  if (selection.kind !== 'folder' || !selectedLabHomeGroupId || !selectedWorkspaceView) return null
  if (selectedWorkspaceView.domain !== selectedLabHomeGroupId) return null
  return resolveWorkspaceViewShortcuts(selectedLabHomeGroupId, selectedLabDomain, views)
    .find((shortcut) => shortcut.id === selectedWorkspaceView.id) ?? null
}

export function filterEntriesBySelectedWorkspaceView(
  scopedEntries: VaultEntry[],
  selection: SidebarSelection,
  selectedLabHomeGroupId: LabHomeGroupId | null,
  selectedLabDomain: ResearchLabDomainKey | null,
  selectedWorkspaceView: SelectedWorkspaceView | null,
  views: readonly ViewFile[] = [],
): VaultEntry[] {
  const activeShortcut = resolveActiveWorkspaceViewShortcut(
    selection,
    selectedLabHomeGroupId,
    selectedLabDomain,
    selectedWorkspaceView,
    views,
  )
  if (!activeShortcut) return scopedEntries
  return scopedEntries.filter((entry) => evaluateFilterGroup(activeShortcut.filters, entry))
}

function searchableTitle(entry: { title?: unknown }): string {
  return typeof entry.title === 'string' ? entry.title : ''
}

export function filterByQuery<T extends { title?: unknown }>(items: T[], query: string): T[] {
  return query ? items.filter((e) => searchableTitle(e).toLowerCase().includes(query)) : items
}

export function filterGroupsByQuery(groups: RelationshipGroup[], query: string): RelationshipGroup[] {
  if (!query) return groups
  return groups.map((g) => ({ ...g, entries: filterByQuery(g.entries, query) })).filter((g) => g.entries.length > 0)
}

export interface ClickActions {
  onReplace: (entry: VaultEntry) => void
  onEnterNeighborhood?: (entry: VaultEntry) => void
  onOpenInNewWindow?: (entry: VaultEntry) => void
  multiSelect: { selectRange: (path: string) => void; clear: () => void; setAnchor: (path: string) => void }
}

function usesCommandModifier(event: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return event.metaKey || event.ctrlKey
}

function isOpenInNewWindowClick(event: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>): boolean {
  return usesCommandModifier(event) && event.shiftKey
}

function isRangeSelectionClick(event: Pick<React.MouseEvent, 'shiftKey'>): boolean {
  return event.shiftKey
}

function isNeighborhoodClick(
  event: Pick<React.MouseEvent, 'metaKey' | 'ctrlKey'>,
  actions: ClickActions,
): boolean {
  return usesCommandModifier(event) && Boolean(actions.onEnterNeighborhood)
}

export function routeNoteClick(entry: VaultEntry, e: React.MouseEvent, actions: ClickActions) {
  if (isOpenInNewWindowClick(e)) {
    actions.onOpenInNewWindow?.(entry)
    return
  }

  if (isRangeSelectionClick(e)) {
    actions.multiSelect.selectRange(entry.path)
    return
  }

  actions.multiSelect.clear()
  if (isNeighborhoodClick(e, actions)) {
    actions.onEnterNeighborhood?.(entry)
    return
  }

  actions.multiSelect.setAnchor(entry.path)
  actions.onReplace(entry)
}

export function createNoteStatusResolver(
  getNoteStatus: ((path: string) => NoteStatus) | undefined,
  modifiedFiles: ModifiedFile[] | undefined,
  modifiedPathSet: Set<string>,
): (path: string) => NoteStatus {
  if (modifiedFiles && modifiedFiles.length > 0) {
    return (path: string) => {
      const explicitStatus = getNoteStatus?.(path)
      if (explicitStatus && explicitStatus !== 'clean') return explicitStatus

      const modifiedFile = modifiedFiles.find((file) => file.path === path)
      if (modifiedFile?.status === 'added' || modifiedFile?.status === 'untracked') return 'new'
      return modifiedPathSet.has(path) ? 'modified' : 'clean'
    }
  }
  if (getNoteStatus) return getNoteStatus
  return () => 'clean'
}

export function toggleSetMember<T>(set: Set<T>, member: T): Set<T> {
  const next = new Set(set)
  if (next.has(member)) next.delete(member)
  else next.add(member)
  return next
}

export function isModifiedEntry(path: string, pathSet: Set<string>, suffixes: string[]): boolean {
  if (pathSet.has(path)) return true
  return suffixes.some((suffix) => path.endsWith(suffix))
}

export function isDeletedNoteEntry(entry: VaultEntry): entry is DeletedNoteEntry {
  return '__deletedNotePreview' in entry && entry.__deletedNotePreview === true
}

function matchesModifiedFile(entry: VaultEntry, file: ModifiedFile): boolean {
  return entry.path === file.path || entry.path.endsWith('/' + file.relativePath)
}

function applyChangeStats<T extends VaultEntry>(entry: T, file: ModifiedFile): T {
  return {
    ...entry,
    __changeAddedLines: file.addedLines ?? null,
    __changeDeletedLines: file.deletedLines ?? null,
    __changeBinary: Boolean(file.binary),
  }
}

function createDeletedNoteEntry(file: ModifiedFile): DeletedNoteEntry {
  const filename = file.relativePath.split('/').pop() ?? file.relativePath
  return {
    path: file.path,
    filename,
    title: filenameStemToTitle(filename),
    isA: 'Note',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: null,
    createdAt: null,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: null,
    organized: false,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: true,
    fileKind: 'markdown',
    __deletedNotePreview: true,
    __deletedRelativePath: file.relativePath,
    __changeAddedLines: file.addedLines ?? null,
    __changeDeletedLines: file.deletedLines ?? null,
    __changeBinary: Boolean(file.binary),
  }
}

export function buildChangesEntries(entries: VaultEntry[], modifiedFiles: ModifiedFile[] | undefined): VaultEntry[] {
  if (!modifiedFiles || modifiedFiles.length === 0) return []

  const liveEntries = entries.flatMap((entry) => {
    const file = modifiedFiles.find((candidate) => candidate.status !== 'deleted' && matchesModifiedFile(entry, candidate))
    return file ? [applyChangeStats(entry, file)] : []
  })

  const deletedEntries = modifiedFiles
    .filter((file) => file.status === 'deleted')
    .filter((file) => !entries.some((entry) => matchesModifiedFile(entry, file)))
    .map(createDeletedNoteEntry)

  return [...liveEntries, ...deletedEntries]
}

export function extractDeletedContentFromDiff(diff: string): string | null {
  const lines: string[] = []
  let inHunk = false

  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) continue
    if (line.startsWith('\\')) continue
    if (line.startsWith('-') || line.startsWith(' ')) {
      lines.push(line.slice(1))
    }
  }

  return lines.length > 0 ? lines.join('\n') : null
}
