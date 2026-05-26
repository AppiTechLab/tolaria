import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorTabSwap } from './useEditorTabSwap'

function makeTab(path: string, title: string, body: string) {
  return {
    entry: { path, title, filename: `${title}.md`, type: 'Note', status: 'Active', aliases: [], isA: '' } as never,
    content: `---\ntitle: ${title}\n---\n\n# ${title}\n\n${body}`,
  }
}

function makeMockEditor(currentMarkdown: string) {
  const markdownRef = { current: currentMarkdown }
  const cursorBlockIdRef = { current: 'body' }
  const docRef = {
    current: [
      {
        id: 'title',
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: 'Fresh Title', styles: {} }],
      },
      {
        id: 'body',
        type: 'paragraph',
        content: [{ type: 'text', text: 'Body typed live', styles: {} }],
      },
    ] as unknown[],
  }

  const editor = {
    get document() { return docRef.current },
    get prosemirrorView() { return {} },
    onMount: (cb: () => void) => { cb(); return () => {} },
    replaceBlocks: vi.fn(),
    insertBlocks: vi.fn(),
    blocksToMarkdownLossy: vi.fn(() => markdownRef.current),
    blocksToHTMLLossy: vi.fn(() => ''),
    tryParseMarkdownToBlocks: vi.fn(() => []),
    getTextCursorPosition: vi.fn(() => ({ block: { id: cursorBlockIdRef.current } })),
    setTextCursorPosition: vi.fn((blockId: string) => {
      cursorBlockIdRef.current = blockId
    }),
    _tiptapEditor: { commands: { setContent: vi.fn() } },
    setMarkdown: (markdown: string) => {
      markdownRef.current = markdown
    },
  }

  return editor
}

function setupMountedEditorMocks() {
  vi.spyOn(document, 'querySelector').mockReturnValue({ scrollTop: 0 } as unknown as Element)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
}

function renderRenameHarness(options?: { onContentChange?: ReturnType<typeof vi.fn> }) {
  const editor = makeMockEditor('# Fresh Title\n\nBody typed live')
  const onContentChange = options?.onContentChange ?? vi.fn()
  const untitledTab = makeTab('untitled-note-123.md', 'Untitled Note 123', 'Body')
  const renamedTab = makeTab('fresh-title.md', 'Fresh Title', 'Body')
  const onLiveContentChange = vi.fn()

  const hook = renderHook(
    ({ tabs, activeTabPath }) => useEditorTabSwap({
      tabs,
      activeTabPath,
      editor: editor as never,
      onContentChange,
      onLiveContentChange,
    }),
    { initialProps: { tabs: [untitledTab], activeTabPath: untitledTab.entry.path } },
  )

  return {
    editor,
    onContentChange,
    onLiveContentChange,
    untitledTab,
    renamedTab,
    ...hook,
  }
}

async function settleRenameHarness(editor: ReturnType<typeof makeMockEditor>) {
  await act(() => new Promise(r => setTimeout(r, 0)))
  editor.replaceBlocks.mockClear()
  editor.tryParseMarkdownToBlocks.mockClear()
}

async function expectRenameSessionContinues(options: { renamedTabArrivesLate: boolean }) {
  const {
    editor,
    onContentChange,
    renamedTab,
    result,
    rerender,
    untitledTab,
  } = renderRenameHarness()

  await settleRenameHarness(editor)

  if (options.renamedTabArrivesLate) {
    rerender({ tabs: [untitledTab], activeTabPath: renamedTab.entry.path })
    await act(() => new Promise(r => setTimeout(r, 0)))
  }

  rerender({ tabs: [renamedTab], activeTabPath: renamedTab.entry.path })
  await act(() => new Promise(r => setTimeout(r, 0)))

  expect(editor.replaceBlocks).not.toHaveBeenCalled()
  expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()

  act(() => {
    result.current.handleEditorChange()
  })
  act(() => {
    result.current.flushPendingEditorChange()
  })

  expect(onContentChange).toHaveBeenCalledWith(
    'fresh-title.md',
    expect.stringContaining('Body typed live'),
  )
}

async function expectWindowsRenameSessionContinues(options: { renamedTabArrivesLate: boolean }) {
  const editor = makeMockEditor('# Fresh Title\n\nBody typed live')
  const onContentChange = vi.fn()
  const untitledTab = makeTab('C:\\vault\\untitled-note-123.md', 'Untitled Note 123', 'Body')
  const renamedTab = makeTab('C:\\vault\\fresh-title.md', 'Fresh Title', 'Body')

  const { result, rerender } = renderHook(
    ({ tabs, activeTabPath }) => useEditorTabSwap({
      tabs,
      activeTabPath,
      editor: editor as never,
      onContentChange,
    }),
    { initialProps: { tabs: [untitledTab], activeTabPath: untitledTab.entry.path } },
  )

  await settleRenameHarness(editor)

  if (options.renamedTabArrivesLate) {
    rerender({ tabs: [untitledTab], activeTabPath: renamedTab.entry.path })
    await act(() => new Promise(r => setTimeout(r, 0)))
  }

  rerender({ tabs: [renamedTab], activeTabPath: renamedTab.entry.path })
  await act(() => new Promise(r => setTimeout(r, 0)))

  expect(editor.replaceBlocks).not.toHaveBeenCalled()
  expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()

  act(() => {
    result.current.handleEditorChange()
  })
  act(() => {
    result.current.flushPendingEditorChange()
  })

  expect(onContentChange).toHaveBeenCalledWith(
    'C:\\vault\\fresh-title.md',
    expect.stringContaining('Body typed live'),
  )
}

describe('useEditorTabSwap untitled rename continuity', () => {
  it('keeps the live editor session when an untitled note auto-renames', async () => {
    setupMountedEditorMocks()
    await expectRenameSessionContinues({ renamedTabArrivesLate: false })
  })

  it('keeps the live editor session when a Windows untitled note auto-renames', async () => {
    setupMountedEditorMocks()
    await expectWindowsRenameSessionContinues({ renamedTabArrivesLate: false })
  })

  it('still swaps when the next note does not match the live untitled body', async () => {
    setupMountedEditorMocks()

    const editor = makeMockEditor('# Fresh Title\n\nBody typed live')
    const untitledTab = makeTab('untitled-note-123.md', 'Untitled Note 123', 'Body')
    const otherTab = makeTab('fresh-title.md', 'Fresh Title', 'Different body')

    const { rerender } = renderHook(
      ({ tabs, activeTabPath }) => useEditorTabSwap({
        tabs,
        activeTabPath,
        editor: editor as never,
      }),
      { initialProps: { tabs: [untitledTab], activeTabPath: untitledTab.entry.path } },
    )

    await act(() => new Promise(r => setTimeout(r, 0)))
    editor.replaceBlocks.mockClear()
    editor.tryParseMarkdownToBlocks.mockClear()

    rerender({ tabs: [otherTab], activeTabPath: otherTab.entry.path })
    await act(() => new Promise(r => setTimeout(r, 0)))

    expect(editor.tryParseMarkdownToBlocks).toHaveBeenCalled()
  })

  it('keeps the live editor session when the renamed tab arrives one render after the path switch', async () => {
    setupMountedEditorMocks()
    await expectRenameSessionContinues({ renamedTabArrivesLate: true })
  })

  it('remaps pending local typing when the untitled path flips to the renamed path mid-edit', async () => {
    setupMountedEditorMocks()

    const {
      editor,
      onContentChange,
      renamedTab,
      result,
      rerender,
    } = renderRenameHarness()

    await settleRenameHarness(editor)

    editor.setMarkdown('# Fresh Title\n\nBody typed right before rename')
    act(() => {
      result.current.handleEditorChange()
    })

    rerender({ tabs: [renamedTab], activeTabPath: renamedTab.entry.path })
    await act(() => new Promise(r => setTimeout(r, 0)))

    expect(editor.replaceBlocks).not.toHaveBeenCalled()
    expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('body', 'end')

    act(() => {
      result.current.flushPendingEditorChange()
    })

    expect(onContentChange).toHaveBeenCalledWith(
      renamedTab.entry.path,
      expect.stringContaining('Body typed right before rename'),
    )
  })

  it('keeps the live editor session when a Windows renamed tab arrives one render after the path switch', async () => {
    setupMountedEditorMocks()
    await expectWindowsRenameSessionContinues({ renamedTabArrivesLate: true })
  })

  it('falls back to the first paragraph block when an empty paragraph gets a new id during untitled rename', async () => {
    setupMountedEditorMocks()

    const markdownRef = { current: '# Fresh Title\n\n' }
    const cursorBlockIdRef = { current: 'body' }
    const docRef = {
      current: [
        {
          id: 'title',
          type: 'heading',
          props: { level: 1 },
          content: [{ type: 'text', text: 'Fresh Title', styles: {} }],
        },
        {
          id: 'body',
          type: 'paragraph',
          content: [],
        },
      ] as unknown[],
    }

    const renamedDocument = [
      {
        id: 'title-2',
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: 'Fresh Title', styles: {} }],
      },
      {
        id: 'body-2',
        type: 'paragraph',
        content: [],
      },
    ] as unknown[]

    const editor = {
      get document() { return docRef.current },
      get prosemirrorView() { return {} },
      onMount: (cb: () => void) => { cb(); return () => {} },
      replaceBlocks: vi.fn(),
      insertBlocks: vi.fn(),
      blocksToMarkdownLossy: vi.fn(() => markdownRef.current),
      blocksToHTMLLossy: vi.fn(() => ''),
      tryParseMarkdownToBlocks: vi.fn(() => []),
      getTextCursorPosition: vi.fn(() => ({ block: { id: cursorBlockIdRef.current } })),
      setTextCursorPosition: vi.fn((blockId: string) => {
        if (blockId === 'body') {
          docRef.current = renamedDocument
          cursorBlockIdRef.current = 'title-2'
          return
        }

        cursorBlockIdRef.current = blockId
      }),
      focus: vi.fn(),
      _tiptapEditor: { commands: { setContent: vi.fn() } },
    }

    const untitledTab = makeTab('untitled-note-123.md', 'Untitled Note 123', '')
    const renamedTab = makeTab('fresh-title.md', 'Fresh Title', '')

    const { rerender } = renderHook(
      ({ tabs, activeTabPath }) => useEditorTabSwap({
        tabs,
        activeTabPath,
        editor: editor as never,
      }),
      { initialProps: { tabs: [untitledTab], activeTabPath: untitledTab.entry.path } },
    )

    await act(() => new Promise(r => setTimeout(r, 0)))

    rerender({ tabs: [renamedTab], activeTabPath: renamedTab.entry.path })
    await act(() => new Promise(r => setTimeout(r, 0)))
    await act(() => new Promise(r => setTimeout(r, 0)))

    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('body', 'end')
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('body-2', 'end')
    expect(cursorBlockIdRef.current).toBe('body-2')
  })

  it('does not re-swap the active note when app state catches up with live typing', async () => {
    setupMountedEditorMocks()

    const editor = makeMockEditor('# Fresh Title\n\nBody typed live')
    const onContentChange = vi.fn()
    const tab = makeTab('fresh-title.md', 'Fresh Title', 'Body')

    const { result, rerender } = renderHook(
      ({ tabs, activeTabPath }) => useEditorTabSwap({
        tabs,
        activeTabPath,
        editor: editor as never,
        onContentChange,
      }),
      { initialProps: { tabs: [tab], activeTabPath: tab.entry.path } },
    )

    await act(() => new Promise(r => setTimeout(r, 0)))

    act(() => {
      result.current.handleEditorChange()
    })
    act(() => {
      result.current.flushPendingEditorChange()
    })

    const syncedContent = onContentChange.mock.calls.at(-1)?.[1]
    expect(typeof syncedContent).toBe('string')

    editor.replaceBlocks.mockClear()
    editor.tryParseMarkdownToBlocks.mockClear()

    rerender({
      tabs: [{ ...tab, content: syncedContent }],
      activeTabPath: tab.entry.path,
    })
    await act(() => new Promise(r => setTimeout(r, 0)))

    expect(editor.replaceBlocks).not.toHaveBeenCalled()
    expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()
  })

  it('does not re-swap while local wikilink insertion is ahead of the latest tab props', async () => {
    setupMountedEditorMocks()

    const editor = makeMockEditor('# Fresh Title\n\nBody')
    const onContentChange = vi.fn()
    const tab = makeTab('fresh-title.md', 'Fresh Title', 'Body')

    const { result, rerender } = renderHook(
      ({ tabs, activeTabPath }) => useEditorTabSwap({
        tabs,
        activeTabPath,
        editor: editor as never,
        onContentChange,
      }),
      { initialProps: { tabs: [tab], activeTabPath: tab.entry.path } },
    )

    await act(() => new Promise(r => setTimeout(r, 0)))

    editor.setMarkdown('# Fresh Title\n\nBody\n\n[[Mana')
    act(() => {
      result.current.handleEditorChange()
    })
    act(() => {
      result.current.flushPendingEditorChange()
    })
    const queryContent = onContentChange.mock.calls.at(-1)?.[1]
    expect(typeof queryContent).toBe('string')

    editor.setMarkdown('# Fresh Title\n\nBody\n\n[[manage-sponsorships]] ')
    act(() => {
      result.current.handleEditorChange()
    })
    act(() => {
      result.current.flushPendingEditorChange()
    })
    const insertedContent = onContentChange.mock.calls.at(-1)?.[1]
    expect(typeof insertedContent).toBe('string')

    editor.replaceBlocks.mockClear()
    editor.tryParseMarkdownToBlocks.mockClear()

    rerender({
      tabs: [{ ...tab, content: queryContent }],
      activeTabPath: tab.entry.path,
    })
    await act(() => new Promise(r => setTimeout(r, 0)))

    expect(editor.replaceBlocks).not.toHaveBeenCalled()
    expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()

    rerender({
      tabs: [{ ...tab, content: insertedContent }],
      activeTabPath: tab.entry.path,
    })
    await act(() => new Promise(r => setTimeout(r, 0)))

    expect(editor.replaceBlocks).not.toHaveBeenCalled()
    expect(editor.tryParseMarkdownToBlocks).not.toHaveBeenCalled()
  })
})
