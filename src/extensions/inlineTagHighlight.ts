import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from '@codemirror/view'
import { getTagStyle } from '../utils/tagStyles'
import { findInlineMarkdownTagMatches } from '../utils/inlineTags'

const decorationCache = new Map<string, Decoration>()

function inlineTagDecoration(tag: string): Decoration {
  const style = getTagStyle(tag)
  const cacheKey = `${style.bg}|${style.color}`
  const cached = decorationCache.get(cacheKey)
  if (cached) return cached

  const decoration = Decoration.mark({
    class: 'cm-inline-tag',
    attributes: {
      style: `--inline-tag-bg:${style.bg};--inline-tag-color:${style.color};`,
    },
  })
  decorationCache.set(cacheKey, decoration)
  return decoration
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()

  for (const match of findInlineMarkdownTagMatches(view.state.doc.toString())) {
    builder.add(match.from, match.to, inlineTagDecoration(match.tag))
  }

  return builder.finish()
}

export const inlineTagHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)