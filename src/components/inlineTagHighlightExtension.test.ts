import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { schema } from './editorSchema'
import {
  buildRichEditorInlineTagDecorations,
  createInlineTagHighlightExtension,
} from './inlineTagHighlightExtension'

describe('createInlineTagHighlightExtension', () => {
  it('creates and destroys a rich editor with the extension installed', () => {
    const editor = BlockNoteEditor.create({
      schema,
      extensions: [createInlineTagHighlightExtension()],
      initialContent: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Keep #project visible during mount and destroy.' },
          ],
        },
      ],
    })

    expect(editor.prosemirrorView).toBeTruthy()
    expect(() => editor._tiptapEditor.destroy()).not.toThrow()
  })

  it('finds decorations for valid inline tags in paragraph text', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Keep #project visible and #research/ai too.' },
          ],
        },
      ],
    })

    try {
      const decorations = buildRichEditorInlineTagDecorations(editor.prosemirrorState.doc)
      const matches = decorations.find().map((decoration) => (
        editor.prosemirrorState.doc.textBetween(decoration.from, decoration.to)
      ))

      expect(matches).toEqual(['#project', '#research/ai'])
    } finally {
      editor._tiptapEditor.destroy()
    }
  })

  it('skips heading text, inline code, and link text', () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        {
          type: 'heading',
          props: { level: 1 },
          content: [
            { type: 'text', text: '#not-a-tag' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ignore ' },
            { type: 'text', text: '#not-a-tag', styles: { code: true } },
            { type: 'text', text: ' and issue #123, keep #project.' },
          ],
        },
      ],
    })

    try {
      const decorations = buildRichEditorInlineTagDecorations(editor.prosemirrorState.doc)
      const matches = decorations.find().map((decoration) => (
        editor.prosemirrorState.doc.textBetween(decoration.from, decoration.to)
      ))

      expect(matches).toEqual(['#project'])
    } finally {
      editor._tiptapEditor.destroy()
    }
  })
})