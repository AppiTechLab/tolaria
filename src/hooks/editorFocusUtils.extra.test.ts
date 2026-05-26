import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { focusEditorWithRetries } from './editorFocusUtils'

describe('editorFocusUtils extra coverage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('uses window focus and selection fallback before logging successful focus timing', () => {
    const editable = document.createElement('div')
    editable.className = 'ProseMirror'
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    editable.tabIndex = -1
    Object.defineProperty(editable, 'isContentEditable', { configurable: true, value: true })
    document.body.appendChild(editable)

    const realFocus = HTMLElement.prototype.focus.bind(editable)
    let focusCalls = 0
    vi.spyOn(editable, 'focus').mockImplementation(() => {
      focusCalls += 1
      if (focusCalls >= 2) realFocus()
    })

    const selection = {
      removeAllRanges: vi.fn(),
      addRange: vi.fn(),
    } as unknown as Selection

    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0')
    const windowFocusSpy = vi.spyOn(window, 'focus').mockImplementation(() => {})
    vi.spyOn(window, 'getSelection').mockReturnValue(selection)
    vi.spyOn(performance, 'now').mockReturnValue(150)
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    focusEditorWithRetries({ focus: vi.fn() }, false, 100)

    expect(windowFocusSpy).toHaveBeenCalled()
    expect(selection.removeAllRanges).toHaveBeenCalled()
    expect(selection.addRange).toHaveBeenCalledTimes(1)
    expect(debugSpy).toHaveBeenCalledWith('[perf] createNote → focus: 50.0ms')
  })

  it('uses the fallback editable selector and treats mixed heading content as empty text', () => {
    const wrapper = document.createElement('div')
    wrapper.className = 'bn-editor'
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    editable.tabIndex = -1
    Object.defineProperty(editable, 'isContentEditable', { configurable: true, value: true })
    wrapper.appendChild(editable)
    document.body.appendChild(wrapper)

    const realFocus = HTMLElement.prototype.focus.bind(editable)
    vi.spyOn(editable, 'focus').mockImplementation(() => realFocus())

    const rAF = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })

    const setTextCursorPosition = vi.fn()

    focusEditorWithRetries({
      focus: vi.fn(),
      document: [
        {
          id: 'title',
          type: 'heading',
          content: [{ kind: 'ignored' }, { type: 'text' }],
        },
      ],
      setTextCursorPosition,
    }, true, undefined)

    expect(rAF).toHaveBeenCalled()
    expect(setTextCursorPosition).toHaveBeenCalledWith('title', 'start')
  })

  it('falls back to a DOM title selection when the editor cursor API does not move browser selection', () => {
    const editable = document.createElement('div')
    editable.className = 'ProseMirror'
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    editable.tabIndex = -1
    Object.defineProperty(editable, 'isContentEditable', { configurable: true, value: true })

    const headingBlock = document.createElement('div')
    headingBlock.className = 'bn-block-content'
    headingBlock.setAttribute('data-content-type', 'heading')
    const headingInline = document.createElement('div')
    headingInline.className = 'bn-inline-content'
    headingBlock.appendChild(headingInline)
    editable.appendChild(headingBlock)
    document.body.appendChild(editable)

    const realFocus = HTMLElement.prototype.focus.bind(editable)
    vi.spyOn(editable, 'focus').mockImplementation(() => realFocus())
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })

    const setTextCursorPosition = vi.fn()

    focusEditorWithRetries({
      focus: vi.fn(),
      document: [{ id: 'title', type: 'heading', props: { level: 1 }, content: [] }],
      setTextCursorPosition,
    }, true, undefined)

    const selection = window.getSelection()
    const anchorNode = selection?.anchorNode ?? null
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null

    expect(setTextCursorPosition).toHaveBeenCalledWith('title', 'start')
    expect(selection?.rangeCount).toBeGreaterThan(0)
    expect(anchorElement && headingBlock.contains(anchorElement)).toBe(true)
  })

  it('does not call editor.focus when editable DOM focus already succeeds', () => {
    const editable = document.createElement('div')
    editable.className = 'ProseMirror'
    editable.contentEditable = 'true'
    editable.setAttribute('contenteditable', 'true')
    editable.tabIndex = -1
    Object.defineProperty(editable, 'isContentEditable', { configurable: true, value: true })
    document.body.appendChild(editable)

    const realFocus = HTMLElement.prototype.focus.bind(editable)
    vi.spyOn(editable, 'focus').mockImplementation(() => realFocus())

    const editorFocus = vi.fn()

    focusEditorWithRetries({ focus: editorFocus }, false, undefined)

    expect(editorFocus).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(editable)
  })

  it('schedules another animation frame when nothing focusable is available yet', () => {
    const rAF = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)

    focusEditorWithRetries({ focus: vi.fn() }, false, undefined)

    expect(rAF).toHaveBeenCalledTimes(1)
  })
})
