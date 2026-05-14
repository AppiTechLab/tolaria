import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { TASKS_BLOCK_TYPE } from '../utils/tasksMarkdown'
import { schema } from './editorSchema'

describe('editor schema tasks parsing', () => {
  it('parses fenced tasks markdown as a rendered tasks block', async () => {
    const editor = BlockNoteEditor.create({ schema })

    const blocks = await editor.tryParseMarkdownToBlocks([
      '```tasks',
      'not done',
      'group by filename',
      '```',
    ].join('\n'))

    expect(blocks[0]).toMatchObject({
      type: TASKS_BLOCK_TYPE,
      props: {
        query: 'not done\ngroup by filename\n',
        source: '```tasks\nnot done\ngroup by filename\n```',
      },
    })
  })
})