import { toDateFilterTimestamp } from './filterDates'
import { splitFrontmatter } from './wikilinks'

const TASK_LINE_RE = /^(\s*)(?:[-*+]|\d+\.)\s+\[([^\]])\]\s+(.*)$/u
const FENCE_DELIMITER_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/u
const TASK_DATE_TOKEN_RE = /(📅|⏳|✅)\s*(\d{4}-\d{2}-\d{2})/gu
const TASK_PRIORITY_SIGNIFIER_RE = /🔺|⏫|🔼|🔽|⏬\uFE0F?/gu
const TOGGLE_TASK_RE = /^(\s*(?:[-*+]|\d+\.)\s+\[)[^\]](\]\s+.*)$/u

type TaskStatusFilter = 'any' | 'done' | 'not_done'
type TaskDateField = 'due' | 'scheduled' | 'done'
type TaskDatePresence = 'any' | 'has' | 'none'
type TaskDateOperator = 'before' | 'after' | 'on' | 'on_or_before' | 'on_or_after'
type TaskPriorityName = 'highest' | 'high' | 'medium' | 'none' | 'low' | 'lowest'
type TaskPriorityOperator = 'is' | 'not' | 'above' | 'below'
type TaskSortField = 'description' | 'due' | 'path' | 'priority'
type TaskSortDirection = 'asc' | 'desc'
type TaskGroupField = 'filename' | 'path'

interface TaskDateComparison {
  operator: TaskDateOperator
  timestamp: number
  source: string
}

const TASK_PRIORITY_VALUES: Array<{ name: TaskPriorityName; rank: number; symbol: string | null }> = [
  { name: 'highest', rank: 0, symbol: '🔺' },
  { name: 'high', rank: 1, symbol: '⏫' },
  { name: 'medium', rank: 2, symbol: '🔼' },
  { name: 'none', rank: 3, symbol: null },
  { name: 'low', rank: 4, symbol: '🔽' },
  { name: 'lowest', rank: 5, symbol: '⏬' },
]

const TASK_PRIORITY_BY_NAME = new Map(TASK_PRIORITY_VALUES.map((value) => [value.name, value]))
const TASK_PRIORITY_WITH_SYMBOL = TASK_PRIORITY_VALUES.filter(
  (value): value is { name: Exclude<TaskPriorityName, 'none'>; rank: number; symbol: string } => value.symbol !== null,
)

export interface MarkdownTask {
  path: string
  lineNumber: number
  lineText: string
  status: string
  checked: boolean
  priority: TaskPriorityName
  prioritySymbol: string | null
  description: string
  rawText: string
  dueDate: string | null
  scheduledDate: string | null
  doneDate: string | null
}

export interface TaskQueryDefinition {
  status: TaskStatusFilter
  duePresence: TaskDatePresence
  scheduledPresence: TaskDatePresence
  donePresence: TaskDatePresence
  descriptionIncludes: string[]
  pathIncludes: string[]
  dueComparisons: TaskDateComparison[]
  scheduledComparisons: TaskDateComparison[]
  doneComparisons: TaskDateComparison[]
  priorityFilters: Array<{ operator: TaskPriorityOperator; priority: TaskPriorityName }>
  limit: number | null
  sorts: Array<{ field: TaskSortField; direction: TaskSortDirection }>
  groupBy: TaskGroupField | null
  explain: boolean
  unsupported: string[]
}

export interface TaskQueryGroup {
  key: string
  tasks: MarkdownTask[]
}

export interface TaskQueryResult {
  query: TaskQueryDefinition
  tasks: MarkdownTask[]
  groups: TaskQueryGroup[]
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase()
}

function filenameFromPath(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  return normalized.split('/').pop() ?? normalized
}

function countLineBreaks(value: string): number {
  return (value.match(/\r?\n/gu) ?? []).length
}

function taskPriorityRank(priority: TaskPriorityName): number {
  return TASK_PRIORITY_BY_NAME.get(priority)?.rank ?? TASK_PRIORITY_BY_NAME.get('none')!.rank
}

function readTaskPriority(rawText: string): Pick<MarkdownTask, 'priority' | 'prioritySymbol'> {
  for (const signifier of TASK_PRIORITY_WITH_SYMBOL) {
    if (rawText.includes(signifier.symbol)) {
      return {
        priority: signifier.name,
        prioritySymbol: signifier.symbol,
      }
    }
  }

  return {
    priority: 'none',
    prioritySymbol: null,
  }
}

function readTaskDates(rawText: string): Pick<MarkdownTask, 'dueDate' | 'scheduledDate' | 'doneDate'> {
  let dueDate: string | null = null
  let scheduledDate: string | null = null
  let doneDate: string | null = null

  for (const match of rawText.matchAll(TASK_DATE_TOKEN_RE)) {
    const marker = match[1]
    const date = match[2]
    if (!date) continue
    if (marker === '📅') dueDate = date
    if (marker === '⏳') scheduledDate = date
    if (marker === '✅') doneDate = date
  }

  return { dueDate, scheduledDate, doneDate }
}

function stripTaskMetadata(rawText: string): string {
  return rawText
    .replace(TASK_DATE_TOKEN_RE, '')
    .replace(TASK_PRIORITY_SIGNIFIER_RE, '')
    .replace(/\s{2,}/gu, ' ')
    .trim()
}

function isFenceDelimiter(line: string): boolean {
  return FENCE_DELIMITER_RE.test(line)
}

function buildTask(path: string, lineNumber: number, lineText: string): MarkdownTask | null {
  const match = TASK_LINE_RE.exec(lineText)
  if (!match) return null

  const status = match[2] ?? ' '
  const rawText = match[3] ?? ''
  const { priority, prioritySymbol } = readTaskPriority(rawText)
  const { dueDate, scheduledDate, doneDate } = readTaskDates(rawText)

  return {
    path,
    lineNumber,
    lineText,
    status,
    checked: status.trim().toLowerCase() === 'x',
    priority,
    prioritySymbol,
    description: stripTaskMetadata(rawText),
    rawText,
    dueDate,
    scheduledDate,
    doneDate,
  }
}

export function extractTasksFromNoteContent(path: string, content: string): MarkdownTask[] {
  const [frontmatter, body] = splitFrontmatter(content)
  const lineOffset = countLineBreaks(frontmatter)
  const lines = body.split(/\r?\n/u)
  const tasks: MarkdownTask[] = []
  let inCodeBlock = false

  for (const [index, line] of lines.entries()) {
    if (isFenceDelimiter(line)) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const task = buildTask(path, lineOffset + index + 1, line)
    if (task) tasks.push(task)
  }

  return tasks
}

export function extractTasksFromVaultContent(contentByPath: Record<string, string>): MarkdownTask[] {
  return Object.entries(contentByPath)
    .sort(([leftPath], [rightPath]) => normalizePath(leftPath).localeCompare(normalizePath(rightPath)))
    .flatMap(([path, content]) => extractTasksFromNoteContent(path, content))
}

function parseSortField(rawField: string): TaskSortField | null {
  if (rawField === 'description') return 'description'
  if (rawField === 'due') return 'due'
  if (rawField === 'path') return 'path'
  if (rawField === 'priority') return 'priority'
  return null
}

function parsePriorityName(rawValue: string): TaskPriorityName | null {
  const normalized = rawValue.toLowerCase() as TaskPriorityName
  return TASK_PRIORITY_BY_NAME.has(normalized) ? normalized : null
}

function parseDateField(rawField: string): TaskDateField | null {
  if (rawField === 'due') return 'due'
  if (rawField === 'scheduled') return 'scheduled'
  if (rawField === 'done') return 'done'
  return null
}

function parseDateOperator(rawOperator: string): TaskDateOperator | null {
  const normalized = rawOperator.toLowerCase()
  if (normalized === 'before') return 'before'
  if (normalized === 'after') return 'after'
  if (normalized === 'on') return 'on'
  if (normalized === 'on or before') return 'on_or_before'
  if (normalized === 'on or after') return 'on_or_after'
  return null
}

function assignDatePresence(query: TaskQueryDefinition, field: TaskDateField, presence: TaskDatePresence): void {
  if (field === 'due') query.duePresence = presence
  if (field === 'scheduled') query.scheduledPresence = presence
  if (field === 'done') query.donePresence = presence
}

function dateComparisonsForField(query: TaskQueryDefinition, field: TaskDateField): TaskDateComparison[] {
  if (field === 'due') return query.dueComparisons
  if (field === 'scheduled') return query.scheduledComparisons
  return query.doneComparisons
}

function parseGroupField(rawField: string): TaskGroupField | null {
  if (rawField === 'filename') return 'filename'
  if (rawField === 'path') return 'path'
  return null
}

function parseTaskQueryLine(line: string, query: TaskQueryDefinition, referenceDate: Date): void {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return

  const lower = trimmed.toLowerCase()
  if (lower === 'done') {
    query.status = 'done'
    return
  }
  if (lower === 'not done') {
    query.status = 'not_done'
    return
  }
  const datePresenceMatch = /^(has|no)\s+(due|scheduled|done) date$/iu.exec(trimmed)
  if (datePresenceMatch?.[1] && datePresenceMatch[2]) {
    const field = parseDateField(datePresenceMatch[2])
    if (field) {
      assignDatePresence(query, field, datePresenceMatch[1].toLowerCase() === 'has' ? 'has' : 'none')
      return
    }
  }
  if (lower === 'explain') {
    query.explain = true
    return
  }

  const pathIncludesMatch = /^path includes\s+(.+)$/iu.exec(trimmed)
  if (pathIncludesMatch?.[1]) {
    query.pathIncludes.push(pathIncludesMatch[1].trim().toLowerCase())
    return
  }

  const descriptionIncludesMatch = /^description includes\s+(.+)$/iu.exec(trimmed)
  if (descriptionIncludesMatch?.[1]) {
    query.descriptionIncludes.push(descriptionIncludesMatch[1].trim().toLowerCase())
    return
  }

  const limitMatch = /^limit\s+(\d+)$/iu.exec(trimmed)
  if (limitMatch?.[1]) {
    query.limit = Number(limitMatch[1])
    return
  }

  const sortMatch = /^sort by\s+(due|description|path|priority)(?:\s+(reverse|asc|desc))?$/iu.exec(trimmed)
  if (sortMatch?.[1]) {
    const field = parseSortField(sortMatch[1].toLowerCase())
    if (field) {
      const rawDirection = sortMatch[2]?.toLowerCase()
      query.sorts.push({
        field,
        direction: rawDirection === 'reverse' || rawDirection === 'desc' ? 'desc' : 'asc',
      })
      return
    }
  }

  const priorityMatch = /^priority is(?:\s+(above|below|not))?\s+(lowest|low|none|medium|high|highest)$/iu.exec(trimmed)
  if (priorityMatch?.[2]) {
    const priority = parsePriorityName(priorityMatch[2])
    if (priority) {
      query.priorityFilters.push({
        operator: (priorityMatch[1]?.toLowerCase() as TaskPriorityOperator | undefined) ?? 'is',
        priority,
      })
      return
    }
  }

  const groupMatch = /^group by\s+(filename|path)$/iu.exec(trimmed)
  if (groupMatch?.[1]) {
    query.groupBy = parseGroupField(groupMatch[1].toLowerCase())
    return
  }

  const dateMatch = /^(due|scheduled|done)\s+(before|after|on|on or before|on or after)\s+(.+)$/iu.exec(trimmed)
  if (dateMatch?.[1] && dateMatch[2] && dateMatch[3]) {
    const field = parseDateField(dateMatch[1])
    const operator = parseDateOperator(dateMatch[2])
    const timestamp = toDateFilterTimestamp(dateMatch[3].trim(), referenceDate)
    if (field && operator && timestamp !== null) {
      dateComparisonsForField(query, field).push({
        operator,
        timestamp,
        source: dateMatch[3].trim(),
      })
      return
    }
  }

  query.unsupported.push(trimmed)
}

export function parseTaskQuery(queryText: string, referenceDate = new Date()): TaskQueryDefinition {
  const query: TaskQueryDefinition = {
    status: 'any',
    duePresence: 'any',
    scheduledPresence: 'any',
    donePresence: 'any',
    descriptionIncludes: [],
    pathIncludes: [],
    dueComparisons: [],
    scheduledComparisons: [],
    doneComparisons: [],
    priorityFilters: [],
    limit: null,
    sorts: [],
    groupBy: null,
    explain: false,
    unsupported: [],
  }

  for (const line of queryText.split(/\r?\n/u)) {
    parseTaskQueryLine(line, query, referenceDate)
  }

  return query
}

function compareNullableDate(left: string | null, right: string | null, direction: TaskSortDirection): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1

  const comparison = left.localeCompare(right)
  return direction === 'asc' ? comparison : -comparison
}

function compareTasks(left: MarkdownTask, right: MarkdownTask, sorts: TaskQueryDefinition['sorts']): number {
  for (const sort of sorts) {
    let comparison = 0
    if (sort.field === 'description') {
      comparison = left.description.localeCompare(right.description)
    } else if (sort.field === 'path') {
      comparison = normalizePath(left.path).localeCompare(normalizePath(right.path))
    } else if (sort.field === 'priority') {
      comparison = taskPriorityRank(left.priority) - taskPriorityRank(right.priority)
    } else if (sort.field === 'due') {
      comparison = compareNullableDate(left.dueDate, right.dueDate, sort.direction)
      if (comparison !== 0) return comparison
      continue
    }

    if (comparison !== 0) return sort.direction === 'asc' ? comparison : -comparison
  }

  const pathComparison = normalizePath(left.path).localeCompare(normalizePath(right.path))
  if (pathComparison !== 0) return pathComparison
  return left.lineNumber - right.lineNumber
}

function taskMatchesStatus(task: MarkdownTask, status: TaskStatusFilter): boolean {
  if (status === 'done') return task.checked
  if (status === 'not_done') return !task.checked
  return true
}

function taskMatchesDatePresence(date: string | null, presence: TaskDatePresence): boolean {
  if (presence === 'has') return date !== null
  if (presence === 'none') return date === null
  return true
}

function taskMatchesDateComparison(date: string | null, comparison: TaskDateComparison): boolean {
  if (!date) return false
  const taskTimestamp = toDateFilterTimestamp(date)
  if (taskTimestamp === null) return false
  if (comparison.operator === 'before') return taskTimestamp < comparison.timestamp
  if (comparison.operator === 'after') return taskTimestamp > comparison.timestamp
  if (comparison.operator === 'on_or_before') return taskTimestamp <= comparison.timestamp
  if (comparison.operator === 'on_or_after') return taskTimestamp >= comparison.timestamp
  return taskTimestamp === comparison.timestamp
}

function taskMatchesPriorityFilter(task: MarkdownTask, filter: TaskQueryDefinition['priorityFilters'][number]): boolean {
  const taskRank = taskPriorityRank(task.priority)
  const filterRank = taskPriorityRank(filter.priority)

  if (filter.operator === 'not') return taskRank !== filterRank
  if (filter.operator === 'above') return taskRank < filterRank
  if (filter.operator === 'below') return taskRank > filterRank
  return taskRank === filterRank
}

function taskMatchesQuery(task: MarkdownTask, query: TaskQueryDefinition): boolean {
  if (!taskMatchesStatus(task, query.status)) return false
  if (!taskMatchesDatePresence(task.dueDate, query.duePresence)) return false
  if (!taskMatchesDatePresence(task.scheduledDate, query.scheduledPresence)) return false
  if (!taskMatchesDatePresence(task.doneDate, query.donePresence)) return false
  if (query.pathIncludes.some((value) => !normalizePath(task.path).includes(value))) return false
  if (query.descriptionIncludes.some((value) => !task.description.toLowerCase().includes(value))) return false
  if (query.dueComparisons.some((comparison) => !taskMatchesDateComparison(task.dueDate, comparison))) return false
  if (query.scheduledComparisons.some((comparison) => !taskMatchesDateComparison(task.scheduledDate, comparison))) return false
  if (query.doneComparisons.some((comparison) => !taskMatchesDateComparison(task.doneDate, comparison))) return false
  if (query.priorityFilters.some((filter) => !taskMatchesPriorityFilter(task, filter))) return false
  return true
}

function groupTasks(tasks: MarkdownTask[], groupBy: TaskGroupField | null): TaskQueryGroup[] {
  if (!groupBy) return []

  const groups = new Map<string, MarkdownTask[]>()
  for (const task of tasks) {
    const key = groupBy === 'filename' ? filenameFromPath(task.path) : task.path
    const existing = groups.get(key)
    if (existing) {
      existing.push(task)
      continue
    }
    groups.set(key, [task])
  }

  return [...groups.entries()].map(([key, groupedTasks]) => ({ key, tasks: groupedTasks }))
}

export function executeTaskQuery({
  queryText,
  contentByPath,
  referenceDate,
}: {
  queryText: string
  contentByPath: Record<string, string>
  referenceDate?: Date
}): TaskQueryResult {
  const query = parseTaskQuery(queryText, referenceDate)
  const extractedTasks = extractTasksFromVaultContent(contentByPath)
  const filteredTasks = extractedTasks
    .filter((task) => taskMatchesQuery(task, query))
    .sort((left, right) => compareTasks(left, right, query.sorts))

  const limitedTasks = query.limit === null ? filteredTasks : filteredTasks.slice(0, query.limit)

  return {
    query,
    tasks: limitedTasks,
    groups: groupTasks(limitedTasks, query.groupBy),
  }
}

export function toggleTaskCheckedInContent({
  content,
  lineNumber,
  checked,
}: {
  content: string
  lineNumber: number
  checked: boolean
}): string {
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/u)
  const index = lineNumber - 1
  if (index < 0 || index >= lines.length) return content

  const nextLine = lines[index]?.replace(TOGGLE_TASK_RE, `$1${checked ? 'x' : ' '}$2`)
  if (!nextLine || nextLine === lines[index]) return content

  lines.splice(index, 1, nextLine)
  return lines.join(lineEnding)
}