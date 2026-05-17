import {
  type BlockLike,
  type DurableBlockCodec,
  injectDurableMarkdownBlocks,
} from './durableMarkdownBlocks'

export const EMBEDDED_NOTE_BLOCK_TYPE = 'embeddedNoteBlock'

const TOKEN_PREFIX = '@@TOLARIA_EMBEDDED_NOTE_BLOCK:'
const TOKEN_SUFFIX = '@@'
const EMBEDDED_NOTE_RE = /^!\[\[([^\]]+)\]\]$/u

interface EmbeddedNotePayload {
  source: string
  target: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeEmbeddedNotePayload(payload: unknown): EmbeddedNotePayload | null {
  if (!isRecord(payload)) return null
  if (typeof payload.source !== 'string') return null
  if (typeof payload.target !== 'string') return null
  return { source: payload.source, target: payload.target }
}

function buildDurableToken(payload: EmbeddedNotePayload): string {
  return `${TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(payload))}${TOKEN_SUFFIX}`
}

function lineEnding(line: string): string {
  if (line.endsWith('\r\n')) return '\r\n'
  return line.endsWith('\n') ? '\n' : ''
}

function lineText(line: string): string {
  const ending = lineEnding(line)
  return ending ? line.slice(0, -ending.length) : line
}

function splitMarkdownLines(markdown: string): string[] {
  const lines = markdown.match(/[^\n]*(?:\n|$)/g) ?? []
  return lines.filter((line, index) => line !== '' || index < lines.length - 1)
}

function isBlankMarkdownLine(line: string | undefined): boolean {
  return line === undefined || lineText(line).trim() === ''
}

function readStandaloneEmbeddedTarget(lines: string[], index: number): string | null {
  const line = lines.at(index)
  if (line === undefined) return null

  const match = lineText(line).trim().match(EMBEDDED_NOTE_RE)
  const target = match?.[1]?.trim() ?? ''
  if (!target) return null
  if (index > 0 && !isBlankMarkdownLine(lines.at(index - 1))) return null
  if (index < lines.length - 1 && !isBlankMarkdownLine(lines.at(index + 1))) return null
  return target
}

export function embeddedNoteSource({ target }: { target: string }): string {
  return `![[${target}]]`
}

export function preProcessEmbeddedNoteMarkdown({ markdown }: { markdown: string }): string {
  const lines = splitMarkdownLines(markdown)
  return lines.map((line, index) => {
    const target = readStandaloneEmbeddedTarget(lines, index)
    if (!target) return line

    return `${buildDurableToken({
      target,
      source: embeddedNoteSource({ target }),
    })}${lineEnding(line)}`
  }).join('')
}

function buildEmbeddedNoteBlock(block: BlockLike, payload: EmbeddedNotePayload): BlockLike {
  return {
    ...block,
    type: EMBEDDED_NOTE_BLOCK_TYPE,
    props: {
      ...(block.props ?? {}),
      source: payload.source,
      target: payload.target,
    },
    content: undefined,
    children: [],
  }
}

function isEmbeddedNoteBlock(block: BlockLike): boolean {
  return block.type === EMBEDDED_NOTE_BLOCK_TYPE
    && typeof block.props?.source === 'string'
    && typeof block.props?.target === 'string'
}

function embeddedNoteMarkdown(block: BlockLike): string {
  const source = block.props?.source
  if (typeof source === 'string' && source) return source

  return embeddedNoteSource({ target: typeof block.props?.target === 'string' ? block.props.target : '' })
}

export const embeddedNoteMarkdownCodec: DurableBlockCodec = {
  tokenPrefix: TOKEN_PREFIX,
  tokenSuffix: TOKEN_SUFFIX,
  readFenceMetadata: () => null,
  // Embedded notes are preprocessed from standalone paragraph lines, not fenced blocks.
  buildPayload: () => ({ source: '', target: '' }),
  decodePayload: decodeEmbeddedNotePayload,
  buildBlock: (block, payload) => buildEmbeddedNoteBlock(block, payload as EmbeddedNotePayload),
  isBlock: isEmbeddedNoteBlock,
  serializeBlock: embeddedNoteMarkdown,
}

export function injectEmbeddedNoteBlocks(blocks: unknown[]): unknown[] {
  return injectDurableMarkdownBlocks({ blocks, codecs: [embeddedNoteMarkdownCodec] })
}