import { encodeDurablePayload, type BlockLike, type DurableBlockCodec } from './durableMarkdownBlocks'

export const CALLOUT_BLOCK_TYPE = 'calloutBlock'

const TOKEN_PREFIX = '@@TOLARIA_CALLOUT_BLOCK:'
const TOKEN_SUFFIX = '@@'

export interface CalloutPayload {
  calloutType: string
  title: string
  body: string
}

interface RecordLike {
  [key: string]: unknown
}

// Alias mapping: non-canonical type → canonical type
const CALLOUT_ALIASES: Record<string, string> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
}

// Known canonical callout types
const KNOWN_CALLOUT_TYPES = new Set([
  'note', 'abstract', 'info', 'todo', 'tip', 'success',
  'question', 'warning', 'failure', 'danger', 'bug', 'example', 'quote',
])

/** Resolves an Obsidian callout type string (including aliases) to a canonical type. */
export function resolveCalloutType(rawType: string): string {
  const lower = rawType.toLowerCase()
  return CALLOUT_ALIASES[lower] ?? (KNOWN_CALLOUT_TYPES.has(lower) ? lower : lower)
}

// First-line pattern for Obsidian callouts:
// > [!type] Title text
// > [!type]+ Title text   (foldable, open by default)
// > [!type]- Title text   (foldable, closed by default)
const CALLOUT_FIRST_LINE = /^> \[!([a-zA-Z][a-zA-Z0-9-]*)\][+-]?[ \t]*(.*)$/

function splitMarkdownLines(markdown: string): string[] {
  const lines = markdown.match(/[^\n]*(?:\n|$)/g) ?? []
  return lines.filter((line, index) => line !== '' || index < lines.length - 1)
}

function lineText(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line
}

function lineEnding(line: string): string {
  return line.endsWith('\n') ? '\n' : ''
}

function buildCalloutToken(payload: CalloutPayload): string {
  return `${TOKEN_PREFIX}${encodeDurablePayload(payload)}${TOKEN_SUFFIX}`
}

/**
 * Pre-processes markdown to convert Obsidian callout blockquotes into durable token placeholders.
 *
 * Input:
 *   > [!info] My Title
 *   > Body line 1
 *   > Body line 2
 *
 * Output:
 *   @@TOLARIA_CALLOUT_BLOCK:<url-encoded-json>@@
 */
export function preProcessCalloutMarkdown({ markdown }: { markdown: string }): string {
  const lines = splitMarkdownLines(markdown)
  const result: string[] = []

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (line === undefined) continue

    const text = lineText(line)
    const firstLineMatch = CALLOUT_FIRST_LINE.exec(text)
    if (!firstLineMatch) {
      result.push(line)
      continue
    }

    const calloutType = resolveCalloutType(firstLineMatch[1] ?? 'note')
    const title = (firstLineMatch[2] ?? '').trim()

    // Collect body lines: all consecutive lines starting with >
    const bodyLines: string[] = []
    let endIndex = index

    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex++) {
      const bodyLine = lines[bodyIndex]
      if (bodyLine === undefined) break

      const bodyText = lineText(bodyLine)
      if (!bodyText.startsWith('>')) break

      // Strip the leading > prefix (and one optional space after it)
      const stripped = bodyText.startsWith('> ') ? bodyText.slice(2) : bodyText.slice(1)
      bodyLines.push(stripped)
      endIndex = bodyIndex
    }

    const body = bodyLines.join('\n')
    const payload: CalloutPayload = { calloutType, title, body }
    const ending = lineEnding(lines[endIndex] ?? '')
    result.push(`${buildCalloutToken(payload)}${ending}`)
    index = endIndex
  }

  return result.join('')
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeCalloutPayload(payload: unknown): CalloutPayload | null {
  if (!isRecord(payload)) return null
  if (typeof payload.calloutType !== 'string') return null
  if (typeof payload.title !== 'string') return null
  if (typeof payload.body !== 'string') return null
  return { calloutType: payload.calloutType, title: payload.title, body: payload.body }
}

function buildCalloutBlock(block: BlockLike, payload: CalloutPayload): BlockLike {
  return {
    ...block,
    type: CALLOUT_BLOCK_TYPE,
    props: {
      ...(block.props ?? {}),
      calloutType: payload.calloutType,
      title: payload.title,
      body: payload.body,
    },
    content: undefined,
    children: [],
  }
}

function isCalloutBlock(block: BlockLike): boolean {
  return block.type === CALLOUT_BLOCK_TYPE
}

/**
 * Serializes a callout block back to Obsidian-compatible callout markdown.
 *
 * Output:
 *   > [!info] My Title
 *   > Body line 1
 *   > Body line 2
 */
export function calloutMarkdown(block: BlockLike): string {
  const calloutType = typeof block.props?.calloutType === 'string' ? block.props.calloutType : 'note'
  const title = typeof block.props?.title === 'string' ? block.props.title : ''
  const body = typeof block.props?.body === 'string' ? block.props.body : ''

  const titlePart = title ? ` ${title}` : ''
  const headerLine = `> [!${calloutType}]${titlePart}`

  if (!body) return headerLine

  const bodyLines = body.split('\n').map((line) => (line ? `> ${line}` : '>'))
  return [headerLine, ...bodyLines].join('\n')
}

export const calloutMarkdownCodec: DurableBlockCodec = {
  tokenPrefix: TOKEN_PREFIX,
  tokenSuffix: TOKEN_SUFFIX,
  // Callouts use blockquote syntax, not fenced code blocks.
  // Preprocessing is handled separately by preProcessCalloutMarkdown.
  readFenceMetadata: () => null,
  buildPayload: () => ({ calloutType: 'note', title: '', body: '' }),
  decodePayload: decodeCalloutPayload,
  buildBlock: (block, payload) => buildCalloutBlock(block, payload as CalloutPayload),
  isBlock: isCalloutBlock,
  serializeBlock: calloutMarkdown,
}
