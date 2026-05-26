import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useEditorTabSwap } from './useEditorTabSwap'
import type { VaultEntry } from '../types'

const initialBlocks = [{
  id: 'initial-paragraph',
  type: 'paragraph',
  content: [{ type: 'text', text: 'A', styles: {} }],
  children: [],
}]

function makeTab(path: string, title: string) {
  return {
    entry: { path, title, filename: `${title}.md`, type: 'Note', status: 'Active', aliases: [], isA: '' } as VaultEntry,
    content: `---\ntitle: ${title}\n---\n\n# ${title}\n\nBody of ${title}.`,
  }
}

function makeMockEditor(docRef: { current: unknown[] }) {
  const editor = {
    get document() { return docRef.current },
    get prosemirrorView() { return {} },
    onMount: (cb: () => void) => { cb(); return () => {} },
    replaceBlocks: vi.fn((_old, newBlocks) => { docRef.current = newBlocks }),
    insertBlocks: vi.fn(),
    blocksToMarkdownLossy: vi.fn(() => ''),
    blocksToHTMLLossy: vi.fn(() => ''),
    tryParseMarkdownToBlocks: vi.fn(() => initialBlocks),
    _tiptapEditor: {
      state: { doc: { content: { size: 8 } } },
      commands: {
        setContent: vi.fn(),
        setTextSelection: vi.fn(),
      },
    },
  }
  return editor
}

function installEditorDomSpies() {
  vi.spyOn(document, 'querySelector').mockReturnValue({ scrollTop: 0 } as unknown as Element)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    cb(0)
    return 0
  })
}

async function flushEditorTick() {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

describe('useEditorTabSwap rich-editor serialization performance', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits live rich-editor content immediately for untitled notes before the debounce flush', async () => {
    installEditorDomSpies()
    const untitledTab = {
      entry: {
        path: 'untitled-note-123.md',
        title: 'Untitled Note 123',
        filename: 'untitled-note-123.md',
        type: 'Note',
        status: 'Active',
        aliases: [],
        isA: '',
      } as VaultEntry,
      content: '---\ntype: Note\n---\n\n# Untitled Note 123\n\n',
    }
    const onContentChange = vi.fn()
    const onLiveContentChange = vi.fn()
    const docRef = { current: initialBlocks as unknown[] }
    const editor = makeMockEditor(docRef)

    const { result } = renderHook(() => useEditorTabSwap({
      tabs: [untitledTab],
      activeTabPath: untitledTab.entry.path,
      rawMode: false,
      editor: editor as never,
      onContentChange,
      onLiveContentChange,
    }))
    await flushEditorTick()

    docRef.current = [{
      id: 'heading-1',
      type: 'heading',
      props: { level: 1 },
      content: [{ type: 'text', text: 'Obsidian', styles: {} }],
      children: [],
    }, {
      id: 'paragraph-1',
      type: 'paragraph',
      content: [{ type: 'text', text: 'Body starts only after intentional Enter.', styles: {} }],
      children: [],
    }]
    editor.blocksToMarkdownLossy.mockReturnValue('# Obsidian\n\nBody starts only after intentional Enter.\n')
    editor.blocksToMarkdownLossy.mockClear()

    act(() => {
      result.current.handleEditorChange()
    })

    expect(onLiveContentChange).toHaveBeenCalledWith(
      untitledTab.entry.path,
      expect.stringContaining('Body starts only after intentional Enter.'),
    )
    expect(onContentChange).not.toHaveBeenCalled()

    act(() => {
      result.current.flushPendingEditorChange()
    })

    expect(onContentChange).toHaveBeenCalledWith(
      untitledTab.entry.path,
      expect.stringContaining('Body starts only after intentional Enter.'),
    )
  })

  it('does not reserialize when local rich-editor content catches up to tab state', async () => {
    installEditorDomSpies()
    const tab = makeTab('a.md', 'Note A')
    const onContentChange = vi.fn()
    const docRef = { current: initialBlocks as unknown[] }
    const editor = makeMockEditor(docRef)
    let currentTabs = [tab]

    const { result, rerender } = renderHook(
      ({ tabs }) => useEditorTabSwap({
        tabs,
        activeTabPath: 'a.md',
        rawMode: false,
        editor: editor as never,
        onContentChange,
      }),
      { initialProps: { tabs: currentTabs } },
    )
    await flushEditorTick()

    docRef.current = [{
      id: 'changed-paragraph',
      type: 'paragraph',
      content: [{ type: 'text', text: 'Changed body', styles: {} }],
      children: [],
    }]
    editor.blocksToMarkdownLossy.mockReturnValue('Changed body\n')
    editor.blocksToMarkdownLossy.mockClear()

    act(() => {
      result.current.handleEditorChange()
      result.current.flushPendingEditorChange()
    })

    expect(editor.blocksToMarkdownLossy).toHaveBeenCalledTimes(1)
    const nextContent = onContentChange.mock.calls[0][1] as string
    currentTabs = [{ ...tab, content: nextContent }]
    rerender({ tabs: currentTabs })
    await flushEditorTick()

    expect(editor.blocksToMarkdownLossy).toHaveBeenCalledTimes(1)
  })
})
