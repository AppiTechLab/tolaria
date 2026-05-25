import { describe, expect, it, vi } from 'vitest'
import {
  createHashtagSlashMenuGuardExtension,
  readActiveHashtagAtEnd,
} from './hashtagSlashMenuGuardExtension'

function createFixture(options: {
  beforeText?: string
  codeBlock?: boolean
  codeMark?: boolean
} = {}) {
  let beforeInputListener: ((event: InputEvent) => void) | null = null
  const transaction = { insertText: vi.fn(() => transaction) }
  const beforeText = options.beforeText ?? '#project/ipc4mh'
  const view = {
    composing: false,
    dispatch: vi.fn(),
    state: {
      storedMarks: null as null | Array<{ type: { name: string } }>,
      selection: {
        from: beforeText.length,
        to: beforeText.length,
        $from: {
          marks: vi.fn(() => options.codeMark ? [{ type: { name: 'code' } }] : []),
          parent: {
            isTextblock: true,
            textBetween: vi.fn(() => beforeText),
            type: { spec: { code: options.codeBlock ?? false } },
          },
          parentOffset: beforeText.length,
        },
      },
      tr: transaction,
    },
  }
  const dom = {
    addEventListener: vi.fn((type: string, listener: (event: InputEvent) => void) => {
      if (type === 'beforeinput') {
        beforeInputListener = listener
      }
    }),
  }
  const editor = {
    _tiptapEditor: { view },
    prosemirrorView: view,
  }
  const extension = createHashtagSlashMenuGuardExtension()({ editor: editor as never })

  return {
    dom,
    extension,
    fireInput(event: Partial<InputEvent> = {}) {
      if (!beforeInputListener) {
        throw new Error('Hashtag slash menu guard did not register a beforeinput listener')
      }

      const inputEvent = {
        data: '/',
        inputType: 'insertText',
        isComposing: false,
        preventDefault: vi.fn(),
        ...event,
      }

      beforeInputListener(inputEvent as InputEvent)
      return inputEvent
    },
    mount() {
      const controller = new AbortController()
      extension.mount?.({
        dom: dom as never,
        root: document,
        signal: controller.signal,
      })
      return controller
    },
    transaction,
    view,
  }
}

describe('readActiveHashtagAtEnd', () => {
  it('recognizes slash-delimited inline tags at the cursor', () => {
    expect(readActiveHashtagAtEnd('Keep working on #project/ipc4mh/task')).toBe('project/ipc4mh/task')
  })

  it('ignores numeric and hex-like hashtags', () => {
    expect(readActiveHashtagAtEnd('Issue #123')).toBeNull()
    expect(readActiveHashtagAtEnd('Color #fff')).toBeNull()
  })
})

describe('createHashtagSlashMenuGuardExtension', () => {
  it('registers a beforeinput listener when the editor mounts', () => {
    const fixture = createFixture()

    fixture.mount()

    expect(fixture.dom.addEventListener).toHaveBeenCalledWith(
      'beforeinput',
      expect.any(Function),
      expect.objectContaining({
        capture: true,
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('inserts a literal slash inside an active hashtag and prevents the native input', () => {
    const fixture = createFixture({ beforeText: 'Plan #project/ipc4mh' })
    fixture.mount()

    const event = fixture.fireInput()

    expect(fixture.transaction.insertText).toHaveBeenCalledWith('/')
    expect(fixture.view.dispatch).toHaveBeenCalledWith(fixture.transaction)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('does not intercept slash outside an active hashtag', () => {
    const fixture = createFixture({ beforeText: 'Plan /commands' })
    fixture.mount()

    const event = fixture.fireInput()

    expect(fixture.transaction.insertText).not.toHaveBeenCalled()
    expect(fixture.view.dispatch).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('does not intercept slash inside code formatting', () => {
    const fixture = createFixture({ beforeText: '#project', codeMark: true })
    fixture.mount()

    const event = fixture.fireInput()

    expect(fixture.transaction.insertText).not.toHaveBeenCalled()
    expect(fixture.view.dispatch).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})