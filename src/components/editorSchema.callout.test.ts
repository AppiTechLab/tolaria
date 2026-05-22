import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { CALLOUT_BLOCK_TYPE } from '../utils/calloutMarkdown'
import {
  injectDurableEditorMarkdownBlocks,
  preProcessDurableEditorMarkdown,
} from '../utils/editorDurableMarkdown'
import { schema } from './editorSchema'

describe('editor schema callout block registration', () => {
  it('creates an editor with a callout block in the schema', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: CALLOUT_BLOCK_TYPE,
          props: {
            body: 'Be careful here',
            calloutType: 'warning',
            title: 'Watch out',
          },
        },
      ] as Parameters<typeof BlockNoteEditor.create>[0]['initialContent'],
    })

    expect(editor.document[0]).toMatchObject({
      props: {
        body: 'Be careful here',
        calloutType: 'warning',
        title: 'Watch out',
      },
      type: CALLOUT_BLOCK_TYPE,
    })
  })

  it('renders markdown inside the callout body like ordinary markdown', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: CALLOUT_BLOCK_TYPE,
          props: {
            body: '**Bold**\n\n- item',
            calloutType: 'note',
            title: 'Parsed body',
          },
        },
      ] as Parameters<typeof BlockNoteEditor.create>[0]['initialContent'],
    })

    const html = editor.blocksToHTMLLossy(editor.document)

    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<li>item</li>')
  })

  it('renders ordered lists inside callouts when the body uses parenthesis markers', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: CALLOUT_BLOCK_TYPE,
          props: {
            body: '\n1) innosuisse project review\n2) prepare course progcollab',
            calloutType: 'tip',
            title: "Today's 3 outcomes",
          },
        },
      ] as Parameters<typeof BlockNoteEditor.create>[0]['initialContent'],
    })

    const html = editor.blocksToHTMLLossy(editor.document)

    expect(html).toContain('<ol>')
    expect(html).toContain('<li>innosuisse project review</li>')
    expect(html).toContain('<li>prepare course progcollab</li>')
  })

  it('renders callout wikilinks as clickable wikilink chips', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: CALLOUT_BLOCK_TYPE,
          props: {
            body: 'See [[Daily Log]]',
            calloutType: 'note',
            title: 'Linked body',
          },
        },
      ] as Parameters<typeof BlockNoteEditor.create>[0]['initialContent'],
    })

    const html = editor.blocksToHTMLLossy(editor.document)

    expect(html).toContain('data-wikilink-target="Daily Log"')
    expect(html).toContain('chat-wikilink')
  })

  it('parses callout markdown into a visible custom block through the real note-open pipeline', async () => {
    const editor = BlockNoteEditor.create({ schema })
    const preprocessed = preProcessDurableEditorMarkdown({
      markdown: [
        '# Title',
        '',
        '> [!warning] Watch out',
        '> **Bold** body',
        '',
        'Tail paragraph',
      ].join('\n'),
    })

    const parsed = await editor.tryParseMarkdownToBlocks(preprocessed)
    const blocks = injectDurableEditorMarkdownBlocks(parsed) as Array<{
      type: string
      props?: Record<string, string>
    }>

    expect(blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'heading' }),
      expect.objectContaining({
        type: CALLOUT_BLOCK_TYPE,
        props: expect.objectContaining({
          calloutType: 'warning',
          title: 'Watch out',
        }),
      }),
      expect.objectContaining({ type: 'paragraph' }),
    ]))
  })

  it('preserves ordered lists in raw callout markdown through the real note-open pipeline', async () => {
    const editor = BlockNoteEditor.create({ schema })
    const preprocessed = preProcessDurableEditorMarkdown({
      markdown: [
        '> [!tip] Today\'s 3 outcomes',
        '>',
        '> 1) innosuisse project review',
        '> 2) prepare course progcollab',
      ].join('\n'),
    })

    const parsed = await editor.tryParseMarkdownToBlocks(preprocessed)
    const blocks = injectDurableEditorMarkdownBlocks(parsed) as Array<{
      type: string
      props?: Record<string, string>
    }>

    expect(blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: CALLOUT_BLOCK_TYPE,
        props: expect.objectContaining({
          title: "Today's 3 outcomes",
          body: '\n1) innosuisse project review\n2) prepare course progcollab',
        }),
      }),
    ]))

    const hydratedEditor = BlockNoteEditor.create({
      schema,
      initialContent: blocks as Parameters<typeof BlockNoteEditor.create>[0]['initialContent'],
    })

    const html = hydratedEditor.blocksToHTMLLossy(hydratedEditor.document)
    expect(html).toContain('<ol>')
    expect(html).toContain('<li>innosuisse project review</li>')
    expect(html).toContain('<li>prepare course progcollab</li>')
  })
})
