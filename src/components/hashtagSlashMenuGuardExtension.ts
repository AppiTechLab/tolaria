import { createExtension } from '@blocknote/core'
import type { useCreateBlockNote } from '@blocknote/react'
import { isInlineMarkdownTag } from '../utils/inlineTags'

type EditorViewLike = NonNullable<ReturnType<typeof useCreateBlockNote>['prosemirrorView']>

const ACTIVE_HASHTAG_AT_END_RE = /(^|\s)#([A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)*)$/u

function isSlashInput(event: InputEvent): event is InputEvent & { data: string } {
  return event.inputType === 'insertText' && event.data === '/'
}

export function readActiveHashtagAtEnd(text: string): string | null {
  const match = text.match(ACTIVE_HASHTAG_AT_END_RE)
  const tag = match?.[2] ?? null
  if (!tag) return null

  return isInlineMarkdownTag(tag) ? tag : null
}

function hasCodeMark(view: EditorViewLike): boolean {
  const marks = view.state.storedMarks ?? view.state.selection.$from.marks()
  return marks.some((mark: { type: { name: string } }) => mark.type.name === 'code')
}

function readActiveHashtagAtCursor(view: EditorViewLike): string | null {
  try {
    const { from, to, $from } = view.state.selection
    if (from !== to) return null
    if (!$from.parent.isTextblock) return null

    const beforeText = $from.parent.textBetween(0, $from.parentOffset, '', '')
    return readActiveHashtagAtEnd(beforeText)
  } catch {
    return null
  }
}

export function shouldHandleHashtagSlashInput(event: InputEvent, view: EditorViewLike): boolean {
  if (!isSlashInput(event)) return false
  if (event.isComposing || view.composing) return false
  if (view.state.selection.$from.parent.type.spec.code) return false
  if (hasCodeMark(view)) return false

  return readActiveHashtagAtCursor(view) !== null
}

function dispatchSlash(view: EditorViewLike): boolean {
  try {
    view.dispatch(view.state.tr.insertText('/'))
    return true
  } catch {
    return false
  }
}

export const createHashtagSlashMenuGuardExtension = createExtension(({ editor }) => {
  const readView = () => editor._tiptapEditor?.view ?? editor.prosemirrorView

  return {
    key: 'hashtagSlashMenuGuard',
    mount: ({ dom, signal }) => {
      const handleBeforeInput = (event: InputEvent) => {
        const view = readView()
        if (!view || !shouldHandleHashtagSlashInput(event, view)) return
        if (!dispatchSlash(view)) return

        event.preventDefault()
      }

      dom.addEventListener('beforeinput', handleBeforeInput as EventListener, {
        capture: true,
        signal,
      })
    },
  } as const
})