import { describe, expect, it, vi } from 'vitest'
import {
  CALLOUT_BLOCK_TYPE,
  calloutMarkdown,
  calloutMarkdownCodec,
  preProcessCalloutMarkdown,
  resolveCalloutType,
} from './calloutMarkdown'
import { injectDurableMarkdownBlocks } from './durableMarkdownBlocks'
import { serializeDurableEditorBlocks } from './editorDurableMarkdown'

describe('resolveCalloutType', () => {
  it('returns canonical types unchanged', () => {
    expect(resolveCalloutType('note')).toBe('note')
    expect(resolveCalloutType('warning')).toBe('warning')
    expect(resolveCalloutType('info')).toBe('info')
  })

  it('normalises to lowercase', () => {
    expect(resolveCalloutType('NOTE')).toBe('note')
    expect(resolveCalloutType('Warning')).toBe('warning')
  })

  it('resolves aliases to canonical types', () => {
    expect(resolveCalloutType('caution')).toBe('warning')
    expect(resolveCalloutType('attention')).toBe('warning')
    expect(resolveCalloutType('hint')).toBe('tip')
    expect(resolveCalloutType('important')).toBe('tip')
    expect(resolveCalloutType('summary')).toBe('abstract')
    expect(resolveCalloutType('tldr')).toBe('abstract')
    expect(resolveCalloutType('check')).toBe('success')
    expect(resolveCalloutType('done')).toBe('success')
    expect(resolveCalloutType('help')).toBe('question')
    expect(resolveCalloutType('faq')).toBe('question')
    expect(resolveCalloutType('fail')).toBe('failure')
    expect(resolveCalloutType('missing')).toBe('failure')
    expect(resolveCalloutType('error')).toBe('danger')
    expect(resolveCalloutType('cite')).toBe('quote')
  })

  it('preserves unknown custom types as-is (lowercased)', () => {
    expect(resolveCalloutType('custom')).toBe('custom')
    expect(resolveCalloutType('MyCustomType')).toBe('mycustomtype')
  })
})

describe('preProcessCalloutMarkdown', () => {
  it('converts a basic callout blockquote to a token', () => {
    const markdown = '> [!info] My Title\n> Body text here\n'
    const result = preProcessCalloutMarkdown({ markdown })
    expect(result).toMatch(/^@@TOLARIA_CALLOUT_BLOCK:.*@@\n$/)

    // Round-trip: inject the token and check it rebuilds the block correctly
    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: result.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks[0].type).toBe(CALLOUT_BLOCK_TYPE)
    expect(typeof blocks[0].id).toBe('string')
    expect(blocks[0].id).not.toHaveLength(0)
    expect(blocks[0].props.calloutType).toBe('info')
    expect(blocks[0].props.title).toBe('My Title')
    expect(blocks[0].props.body).toBe('Body text here')
  })

  it('converts a callout with no title', () => {
    const markdown = '> [!warning]\n> Something bad happened\n'
    const result = preProcessCalloutMarkdown({ markdown })

    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: result.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks[0].type).toBe(CALLOUT_BLOCK_TYPE)
    expect(blocks[0].props.calloutType).toBe('warning')
    expect(blocks[0].props.title).toBe('')
    expect(blocks[0].props.body).toBe('Something bad happened')
  })

  it('converts a callout with no body', () => {
    const markdown = '> [!tip] Just a title\n'
    const result = preProcessCalloutMarkdown({ markdown })

    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: result.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks[0].type).toBe(CALLOUT_BLOCK_TYPE)
    expect(blocks[0].props.calloutType).toBe('tip')
    expect(blocks[0].props.title).toBe('Just a title')
    expect(blocks[0].props.body).toBe('')
  })

  it('collects multi-line callout body', () => {
    const markdown = '> [!note] Title\n> Line 1\n> Line 2\n> Line 3\n'
    const result = preProcessCalloutMarkdown({ markdown })

    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: result.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks[0].props.body).toBe('Line 1\nLine 2\nLine 3')
  })

  it('preserves fenced tasks blocks inside the callout body', () => {
    const markdown = [
      '> [!danger] Due today / overdue',
      '>',
      '> ```tasks',
      '> not done',
      '> due before tomorrow',
      '> ```',
      '',
    ].join('\n')
    const result = preProcessCalloutMarkdown({ markdown })

    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: result.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks[0].type).toBe(CALLOUT_BLOCK_TYPE)
    expect(blocks[0].props.title).toBe('Due today / overdue')
    expect(blocks[0].props.body).toBe('\n```tasks\nnot done\ndue before tomorrow\n```')
  })

  it('resolves aliases when preprocessing', () => {
    const markdown = '> [!caution] Watch out\n'
    const result = preProcessCalloutMarkdown({ markdown })

    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: result.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks[0].props.calloutType).toBe('warning')
  })

  it('handles foldable callout markers (+ and -)', () => {
    const foldableOpen = '> [!tip]+ Foldable\n> Content\n'
    const foldableClosed = '> [!tip]- Foldable\n> Content\n'

    const blocks1 = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: preProcessCalloutMarkdown({ markdown: foldableOpen }).trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    const blocks2 = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: preProcessCalloutMarkdown({ markdown: foldableClosed }).trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    }) as Array<{ type: string; props: Record<string, string> }>

    expect(blocks1[0].props.calloutType).toBe('tip')
    expect(blocks1[0].props.title).toBe('Foldable')
    expect(blocks2[0].props.calloutType).toBe('tip')
  })

  it('leaves non-callout blockquotes untouched', () => {
    const markdown = '> This is a regular blockquote\n> Second line\n'
    const result = preProcessCalloutMarkdown({ markdown })
    expect(result).toBe(markdown)
  })

  it('leaves normal paragraphs untouched', () => {
    const markdown = 'Just some text\n\nAnother paragraph\n'
    const result = preProcessCalloutMarkdown({ markdown })
    expect(result).toBe(markdown)
  })

  it('handles a callout between other content', () => {
    const markdown = 'Before\n\n> [!info] Title\n> Body\n\nAfter\n'
    const result = preProcessCalloutMarkdown({ markdown })
    const lines = result.split('\n')
    expect(lines[0]).toBe('Before')
    expect(lines[2]).toMatch(/^@@TOLARIA_CALLOUT_BLOCK:/)
    expect(lines[4]).toBe('After')
  })
})

describe('calloutMarkdown serialization', () => {
  it('serializes a callout block with title and body', () => {
    const block = {
      type: CALLOUT_BLOCK_TYPE,
      props: { calloutType: 'info', title: 'My Title', body: 'Body text here' },
      children: [],
    }
    expect(calloutMarkdown(block)).toBe('> [!info] My Title\n> Body text here')
  })

  it('serializes a callout block with no title', () => {
    const block = {
      type: CALLOUT_BLOCK_TYPE,
      props: { calloutType: 'warning', title: '', body: 'Something bad' },
      children: [],
    }
    expect(calloutMarkdown(block)).toBe('> [!warning]\n> Something bad')
  })

  it('serializes a callout block with no body', () => {
    const block = {
      type: CALLOUT_BLOCK_TYPE,
      props: { calloutType: 'tip', title: 'Just a title', body: '' },
      children: [],
    }
    expect(calloutMarkdown(block)).toBe('> [!tip] Just a title')
  })

  it('serializes multi-line body with > prefix on each line', () => {
    const block = {
      type: CALLOUT_BLOCK_TYPE,
      props: { calloutType: 'note', title: 'Title', body: 'Line 1\nLine 2\nLine 3' },
      children: [],
    }
    expect(calloutMarkdown(block)).toBe('> [!note] Title\n> Line 1\n> Line 2\n> Line 3')
  })

  it('uses > (no space) for empty body lines', () => {
    const block = {
      type: CALLOUT_BLOCK_TYPE,
      props: { calloutType: 'note', title: '', body: 'First\n\nSecond' },
      children: [],
    }
    expect(calloutMarkdown(block)).toBe('> [!note]\n> First\n>\n> Second')
  })
})

describe('callout round-trip through serialize pipeline', () => {
  it('round-trips a callout through preProcess → inject → serialize', () => {
    const originalMarkdown = '> [!warning] Watch out\n> Be careful here\n'
    const preprocessed = preProcessCalloutMarkdown({ markdown: originalMarkdown })

    const blocks = injectDurableMarkdownBlocks({
      blocks: [{ type: 'paragraph', content: [{ type: 'text', text: preprocessed.trim(), styles: {} }], children: [] }],
      codecs: [calloutMarkdownCodec],
    })

    const editor = { blocksToMarkdownLossy: vi.fn(() => '') }
    const serialized = serializeDurableEditorBlocks(editor, blocks)
    expect(serialized).toBe('> [!warning] Watch out\n> Be careful here')
  })
})
