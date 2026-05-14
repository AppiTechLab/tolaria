import { describe, expect, it, vi } from 'vitest'
import {
  TASKS_BLOCK_TYPE,
  injectTasksInBlocks,
  preProcessTasksMarkdown,
} from './tasksMarkdown'
import { serializeDurableEditorBlocks } from './editorDurableMarkdown'

describe('tasks markdown round-trip', () => {
  it('injects fenced tasks queries into dedicated task blocks', () => {
    const markdown = [
      '```tasks',
      'not done',
      'sort by due reverse',
      '```',
    ].join('\n')
    const preprocessed = preProcessTasksMarkdown({ markdown })
    const blocks = [{
      type: 'paragraph',
      content: [{ type: 'text', text: preprocessed, styles: {} }],
      children: [],
    }]

    const [block] = injectTasksInBlocks(blocks) as Array<{
      type: string
      props: { query: string; source: string }
    }>

    expect(block.type).toBe(TASKS_BLOCK_TYPE)
    expect(block.props.query).toBe('not done\nsort by due reverse\n')
    expect(block.props.source).toBe(markdown)
  })

  it('injects parsed tasks code blocks into dedicated task blocks', () => {
    const [block] = injectTasksInBlocks([{
      type: 'codeBlock',
      props: { language: 'tasks' },
      content: [{ type: 'text', text: 'not done\nlimit 5', styles: {} }],
      children: [],
    }]) as Array<{
      type: string
      props: { query: string; source: string }
    }>

    expect(block.type).toBe(TASKS_BLOCK_TYPE)
    expect(block.props.query).toBe('not done\nlimit 5\n')
    expect(block.props.source).toBe('```tasks\nnot done\nlimit 5\n```')
  })

  it('serializes tasks blocks beside ordinary markdown', () => {
    const editor = {
      blocksToMarkdownLossy: vi.fn((blocks: unknown[]) => {
        return (blocks as Array<{ content?: Array<{ text?: string }> }>)
          .map((block) => block.content?.map((item) => item.text ?? '').join('') ?? '')
          .join('\n\n')
      }),
    }
    const blocks = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }], children: [] },
      { type: TASKS_BLOCK_TYPE, props: { source: '```tasks\nnot done\n```', query: 'not done\n' }, children: [] },
    ]

    expect(serializeDurableEditorBlocks(editor, blocks)).toBe([
      'Intro',
      '```tasks\nnot done\n```',
    ].join('\n\n'))
  })
})