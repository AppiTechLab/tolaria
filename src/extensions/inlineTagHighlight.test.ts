import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { inlineTagHighlightPlugin } from './inlineTagHighlight'

function createView(doc: string) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const state = EditorState.create({
    doc,
    extensions: [inlineTagHighlightPlugin],
  })
  const view = new EditorView({ state, parent })
  return { view, parent }
}

describe('inlineTagHighlightPlugin', () => {
  it('decorates valid inline tags in markdown text', () => {
    const { view, parent } = createView('Text before #project/ipc4mh and #meeting-notes after.')
    const tags = parent.querySelectorAll('.cm-inline-tag')
    expect(tags).toHaveLength(2)
    expect(tags[0].textContent).toBe('#project/ipc4mh')
    expect(tags[1].textContent).toBe('#meeting-notes')
    view.destroy()
    parent.remove()
  })

  it('ignores headings, code, urls, colors, and numeric issue markers', () => {
    const { view, parent } = createView('# Heading\n\nUse `#not-a-tag`.\n\n```js\nconst tag = "#not-a-tag"\n```\n\nVisit https://example.com/page#section and skip #fff plus issue #123.')
    expect(parent.querySelectorAll('.cm-inline-tag')).toHaveLength(0)
    view.destroy()
    parent.remove()
  })
})