import { describe, expect, it } from 'vitest'
import { findInlineMarkdownTagMatches, findInlineTagMatchesInText, isInlineMarkdownTag, preprocessInlineTags } from './inlineTags'

describe('inline tag detection', () => {
  it('finds valid inline tags at line start and after whitespace', () => {
    const matches = findInlineMarkdownTagMatches('---\ntags: [frontmatter]\n---\n#project\nText before #research/ai and #ipc4mh/task after')
    expect(matches.map((match) => match.tag)).toEqual(['project', 'research/ai', 'ipc4mh/task'])
  })

  it('ignores headings, inline code, fenced code, colors, numeric tags, and url fragments', () => {
    const matches = findInlineMarkdownTagMatches('# Heading\n\nUse `#not-a-tag`.\n\n```js\nconst tag = "#not-a-tag"\n```\n\nVisit https://example.com/page#anchor and skip #fff plus issue #123 but keep #lab-management/equipment.')
    expect(matches.map((match) => match.tag)).toEqual(['lab-management/equipment'])
  })

  it('validates candidate tags with at least one letter', () => {
    expect(isInlineMarkdownTag('project')).toBe(true)
    expect(isInlineMarkdownTag('research/ai')).toBe(true)
    expect(isInlineMarkdownTag('123')).toBe(false)
    expect(isInlineMarkdownTag('fff')).toBe(false)
  })

  it('preprocesses valid inline tags into custom markdown links', () => {
    expect(preprocessInlineTags('Keep #project and #meeting-notes visible.'))
      .toBe('Keep [#project](inlinetag://project) and [#meeting-notes](inlinetag://meeting-notes) visible.')
  })

  it('finds valid inline tags in plain text segments', () => {
    const matches = findInlineTagMatchesInText('Keep #project visible, ignore #123 and #fff, and keep #research/ai.')
    expect(matches.map((match) => match.tag)).toEqual(['project', 'research/ai'])
  })
})