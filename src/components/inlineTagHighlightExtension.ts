import { createExtension } from '@blocknote/core'
import type { useCreateBlockNote } from '@blocknote/react'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { findInlineTagMatchesInText } from '../utils/inlineTags'
import { getTagStyle } from '../utils/tagStyles'

type EditorViewLike = NonNullable<ReturnType<typeof useCreateBlockNote>['prosemirrorView']>
type ProsemirrorDoc = EditorViewLike['state']['doc']
type ProsemirrorTextNode = ProsemirrorDoc['type']['schema']['nodes'][string]

const INLINE_TAG_PLUGIN_KEY = new PluginKey<DecorationSet>('rich-editor-inline-tags')
const SKIPPED_PARENT_TYPES = new Set(['heading', 'codeBlock', 'link'])
const SKIPPED_MARK_TYPES = new Set(['code', 'link'])

const decorationStyleCache = new Map<string, string>()

function shouldSkipTextNode(parentTypeName: string | undefined, marks: ProsemirrorTextNode['marks']): boolean {
  if (parentTypeName && SKIPPED_PARENT_TYPES.has(parentTypeName)) return true
  return marks.some((mark) => SKIPPED_MARK_TYPES.has(mark.type.name))
}

function inlineTagDecorationStyle(tag: string): string {
  const style = getTagStyle(tag)
  const cacheKey = `${style.bg}|${style.color}`
  const cached = decorationStyleCache.get(cacheKey)
  if (cached) return cached

  const decorationStyle = `--inline-tag-bg:${style.bg};--inline-tag-color:${style.color};`
  decorationStyleCache.set(cacheKey, decorationStyle)
  return decorationStyle
}

export function buildRichEditorInlineTagDecorations(doc: ProsemirrorDoc): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos, parent) => {
    if (!node.isText || !node.text) return
    if (shouldSkipTextNode(parent?.type.name, node.marks)) return

    for (const match of findInlineTagMatchesInText(node.text)) {
      decorations.push(
        Decoration.inline(pos + match.from, pos + match.to, {
          class: 'bn-inline-tag',
          style: inlineTagDecorationStyle(match.tag),
        }),
      )
    }
  })

  return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty
}

export const createInlineTagHighlightExtension = createExtension(() => ({
  key: 'richEditorInlineTagHighlight',
  prosemirrorPlugins: [
    new Plugin<DecorationSet>({
      key: INLINE_TAG_PLUGIN_KEY,
      state: {
        init(_, state) {
          return buildRichEditorInlineTagDecorations(state.doc)
        },
        apply(transaction, decorationSet) {
          if (!transaction.docChanged) return decorationSet
          return buildRichEditorInlineTagDecorations(transaction.doc)
        },
      },
      props: {
        decorations(state) {
          return INLINE_TAG_PLUGIN_KEY.getState(state) ?? DecorationSet.empty
        },
      },
    }),
  ],
}))