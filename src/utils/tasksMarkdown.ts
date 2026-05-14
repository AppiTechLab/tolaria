import {
  type BlockLike,
  type DurableBlockCodec,
  type DurableFencePayloadInput,
  injectDurableMarkdownBlocks,
  preProcessDurableMarkdownBlocks,
  readCodeBlockLanguage,
  readInlineText,
} from './durableMarkdownBlocks'

export const TASKS_BLOCK_TYPE = 'tasksBlock'

const TOKEN_PREFIX = '@@TOLARIA_TASKS_BLOCK:'
const TOKEN_SUFFIX = '@@'

interface TasksPayload {
  query: string
  source: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeTasksPayload(payload: unknown): TasksPayload | null {
  if (!isRecord(payload)) return null
  if (typeof payload.query !== 'string') return null
  if (typeof payload.source !== 'string') return null
  return { query: payload.query, source: payload.source }
}

function readTasksFenceMetadata(info: string): Record<string, never> | null {
  const language = info.trim().split(/\s+/u)[0]?.toLowerCase()
  return language === 'tasks' ? {} : null
}

function normalizeTasksQuery(query: string): string {
  return query.endsWith('\n') ? query : `${query}\n`
}

export function tasksFenceSource({ query }: { query: string }): string {
  return `\`\`\`tasks\n${normalizeTasksQuery(query)}\`\`\``
}

function buildTasksPayload({ lines, start, end }: DurableFencePayloadInput): TasksPayload {
  const query = lines.slice(start + 1, end).join('')
  const normalizedQuery = normalizeTasksQuery(query)
  return {
    query: normalizedQuery,
    source: tasksFenceSource({ query: normalizedQuery }),
  }
}

function buildTasksBlock(block: BlockLike, payload: TasksPayload): BlockLike {
  return {
    ...block,
    type: TASKS_BLOCK_TYPE,
    props: {
      ...(block.props ?? {}),
      query: payload.query,
      source: payload.source,
    },
    content: undefined,
    children: [],
  }
}

function readTasksCodeBlock(block: BlockLike): TasksPayload | null {
  if (block.type !== 'codeBlock') return null
  if (readCodeBlockLanguage({ block }) !== 'tasks') return null

  const query = readInlineText(block.content)
  if (query === null) return null

  const normalizedQuery = normalizeTasksQuery(query)
  return {
    query: normalizedQuery,
    source: tasksFenceSource({ query: normalizedQuery }),
  }
}

function isTasksBlock(block: BlockLike): boolean {
  return block.type === TASKS_BLOCK_TYPE
    && typeof block.props?.query === 'string'
    && typeof block.props?.source === 'string'
}

function tasksMarkdown(block: BlockLike): string {
  const source = block.props?.source
  if (typeof source === 'string' && source) return source

  return tasksFenceSource({ query: typeof block.props?.query === 'string' ? block.props.query : '' })
}

export const tasksMarkdownCodec: DurableBlockCodec = {
  tokenPrefix: TOKEN_PREFIX,
  tokenSuffix: TOKEN_SUFFIX,
  readFenceMetadata: readTasksFenceMetadata,
  buildPayload: buildTasksPayload,
  decodePayload: decodeTasksPayload,
  buildBlock: (block, payload) => buildTasksBlock(block, payload as TasksPayload),
  readCodeBlock: readTasksCodeBlock,
  isBlock: isTasksBlock,
  serializeBlock: tasksMarkdown,
}

export function preProcessTasksMarkdown({ markdown }: { markdown: string }): string {
  return preProcessDurableMarkdownBlocks({ markdown, codecs: [tasksMarkdownCodec] })
}

export function injectTasksInBlocks(blocks: unknown[]): unknown[] {
  return injectDurableMarkdownBlocks({ blocks, codecs: [tasksMarkdownCodec] })
}