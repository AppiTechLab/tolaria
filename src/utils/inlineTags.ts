export interface InlineMarkdownTagMatch {
  tag: string
  text: string
  from: number
  to: number
}

const INLINE_TAG_SCHEME = 'inlinetag://'
const INLINE_TAG_RE = /(^|\s)#([A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)*)/g
const INLINE_CODE_RE = /`[^`\n]*`/g
const HEX_COLOR_RE = /^(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/

export { INLINE_TAG_SCHEME }

function frontmatterOpeningLength(content: string): number | null {
  if (content.startsWith('---\r\n')) return 5
  if (content.startsWith('---\n')) return 4
  return null
}

function precedingLineEndingLength(value: string): number {
  return value.startsWith('\r\n') ? 2 : value.startsWith('\n') ? 1 : 0
}

function frontmatterCloseLength(value: string): number {
  const lineEndingLength = precedingLineEndingLength(value)
  if (value.endsWith('\r\n')) return lineEndingLength + 5
  if (value.endsWith('\n')) return lineEndingLength + 4
  return lineEndingLength + 3
}

function splitFrontmatter(content: string): [string, string] {
  const openLength = frontmatterOpeningLength(content)
  if (openLength === null) return ['', content]

  const afterOpen = content.slice(openLength)
  const close = afterOpen.match(/(?:^|\r?\n)---(?:\r?\n|$)/)
  if (!close || close.index === undefined) return ['', content]

  const to = openLength + close.index + frontmatterCloseLength(close[0])
  return [content.slice(0, to), content.slice(to)]
}

function isMarkdownFence(line: string): boolean {
  return /^\s*(```|~~~)/.test(line)
}

function isMarkdownHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s/.test(line)
}

function readInlineCodeRanges(line: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  INLINE_CODE_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = INLINE_CODE_RE.exec(line)) !== null) {
    ranges.push({ from: match.index, to: match.index + match[0].length })
  }

  return ranges
}

function rangeOverlapsInlineCode(
  from: number,
  to: number,
  inlineCodeRanges: Array<{ from: number; to: number }>,
): boolean {
  return inlineCodeRanges.some((range) => from < range.to && to > range.from)
}

function isHexColorTag(tag: string): boolean {
  return !tag.includes('/') && HEX_COLOR_RE.test(tag)
}

function isNumericOnlyTag(tag: string): boolean {
  return /^\d+$/u.test(tag)
}

function hasAlphabeticCharacter(tag: string): boolean {
  return /[A-Za-z]/u.test(tag)
}

export function isInlineMarkdownTag(tag: string): boolean {
  return hasAlphabeticCharacter(tag) && !isNumericOnlyTag(tag) && !isHexColorTag(tag)
}

export function findInlineTagMatchesInText(content: string): InlineMarkdownTagMatch[] {
  const matches: InlineMarkdownTagMatch[] = []
  INLINE_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = INLINE_TAG_RE.exec(content)) !== null) {
    const boundary = match[1] ?? ''
    const tag = match[2] ?? ''
    if (!isInlineMarkdownTag(tag)) continue

    const start = match.index + boundary.length
    matches.push({
      tag,
      text: `#${tag}`,
      from: start,
      to: start + 1 + tag.length,
    })
  }

  return matches
}

function markdownLinesWithOffsets(content: string): Array<{ text: string; from: number }> {
  const records: Array<{ text: string; from: number }> = []
  const lineRegex = /[^\r\n]*(?:\r\n|\n|$)/g
  let match: RegExpExecArray | null
  let offset = 0

  while ((match = lineRegex.exec(content)) !== null) {
    const lineWithEnding = match[0]
    if (lineWithEnding === '' && offset === content.length) break

    records.push({
      text: lineWithEnding.replace(/\r?\n$/, ''),
      from: offset,
    })
    offset += lineWithEnding.length
  }

  return records
}

function collectInlineTagMatchesFromLine(
  line: string,
  lineOffset: number,
  matches: InlineMarkdownTagMatch[],
): void {
  const inlineCodeRanges = readInlineCodeRanges(line)
  for (const match of findInlineTagMatchesInText(line)) {
    const start = match.from
    const end = match.to
    if (rangeOverlapsInlineCode(start, end, inlineCodeRanges)) continue

    matches.push({
      tag: match.tag,
      text: match.text,
      from: lineOffset + start,
      to: lineOffset + end,
    })
  }
}

function encodeTarget(target: string): string {
  return encodeURIComponent(target).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

export function findInlineMarkdownTagMatches(content: string): InlineMarkdownTagMatch[] {
  const [frontmatter, body] = splitFrontmatter(content)
  const bodyOffset = frontmatter.length
  const matches: InlineMarkdownTagMatch[] = []
  let inFence = false

  for (const line of markdownLinesWithOffsets(body)) {
    if (isMarkdownFence(line.text)) {
      inFence = !inFence
      continue
    }
    if (inFence || isMarkdownHeading(line.text)) continue

    collectInlineTagMatchesFromLine(line.text, bodyOffset + line.from, matches)
  }

  return matches
}

export function preprocessInlineTags(content: string): string {
  const matches = findInlineMarkdownTagMatches(content)
  if (matches.length === 0) return content

  let result = ''
  let cursor = 0
  for (const match of matches) {
    result += content.slice(cursor, match.from)
    result += `[${match.text}](${INLINE_TAG_SCHEME}${encodeTarget(match.tag)})`
    cursor = match.to
  }
  result += content.slice(cursor)
  return result
}