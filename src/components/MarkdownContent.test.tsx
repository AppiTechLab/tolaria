import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { VaultEntry } from '../types'
import { MarkdownContent } from './MarkdownContent'
import { TasksBlockContext } from './tasksBlockContext'
import { preprocessWikilinks } from '../utils/chatWikilinks'

const vaultLoaderCommandsMock = vi.hoisted(() => ({
  tauriCall: vi.fn(),
}))

vi.mock('../hooks/vaultLoaderCommands', () => ({
  tauriCall: vaultLoaderCommandsMock.tauriCall,
}))

function makeEntry(overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    path: '/vault/project.md',
    title: 'Project',
    filename: 'project.md',
    folder: 'project',
    createdAt: '2026-01-01T00:00:00.000Z',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    aliases: [],
    links: [],
    backlinks: [],
    relatedTo: [],
    belongsTo: [],
    backlinksCount: 0,
    wordCount: 0,
    frontmatter: {},
    relationships: {},
    isDirectory: false,
    fileKind: 'markdown',
    favorite: false,
    organized: true,
    ...overrides,
  }
}

function dispatchMouseEvent(target: Node, type: 'click' | 'mousedown') {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

describe('MarkdownContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders bold text', () => {
    render(<MarkdownContent content="Hello **world**" />)
    const strong = screen.getByText('world')
    expect(strong.tagName).toBe('STRONG')
  })

  it('renders inline code', () => {
    render(<MarkdownContent content="Use `console.log`" />)
    const code = screen.getByText('console.log')
    expect(code.tagName).toBe('CODE')
  })

  it('renders fenced code blocks', () => {
    const { container } = render(<MarkdownContent content={'```js\nconst x = 1\n```'} />)
    const pre = container.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre!.textContent).toContain('const x = 1')
  })

  it('keeps tasks fences as code blocks when task block rendering is disabled', () => {
    const { container } = render(<MarkdownContent content={'```tasks\nnot done\n```'} />)
    const pre = container.querySelector('pre')
    expect(pre).toBeTruthy()
    expect(pre!.textContent).toContain('not done')
  })

  it('renders fenced tasks blocks as live task query blocks when enabled', async () => {
    vaultLoaderCommandsMock.tauriCall.mockResolvedValueOnce({
      '/vault/project.md': '# Project\n\n- [ ] Follow up\n',
    })

    const { container } = render(
      <TasksBlockContext.Provider
        value={{
          entries: [makeEntry()],
          locale: 'en',
          onNavigateWikilink: vi.fn(),
          sourceEntry: undefined,
          vaultPath: '/vault',
        }}
      >
        <MarkdownContent content={'```tasks\nnot done\n```'} renderTaskBlocks />
      </TasksBlockContext.Provider>,
    )

    expect(container.querySelector('pre')).toBeNull()
    expect(await screen.findByText('Follow up')).toBeInTheDocument()
    expect(vaultLoaderCommandsMock.tauriCall).toHaveBeenCalledWith(expect.objectContaining({
      command: 'get_all_content',
      tauriArgs: { vaultPath: '/vault' },
    }))
  })

  it('renders unordered lists', () => {
    const { container } = render(<MarkdownContent content={'- one\n- two\n- three'} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe('one')
  })

  it('renders ordered lists', () => {
    const { container } = render(<MarkdownContent content={'1. first\n2. second'} />)
    const ol = container.querySelector('ol')
    expect(ol).toBeTruthy()
    expect(ol!.querySelectorAll('li')).toHaveLength(2)
  })

  it('renders ordered lists written with parenthesis markers', () => {
    const { container } = render(<MarkdownContent content={'1) first\n2) second'} />)
    const ol = container.querySelector('ol')
    expect(ol).toBeTruthy()
    expect(ol!.querySelectorAll('li')).toHaveLength(2)
  })

  it('renders headers', () => {
    render(<MarkdownContent content="## Section Title" />)
    const h2 = screen.getByText('Section Title')
    expect(h2.tagName).toBe('H2')
  })

  it('renders links', () => {
    render(<MarkdownContent content="[Click here](https://example.com)" />)
    const link = screen.getByText('Click here') as HTMLAnchorElement
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('https://example.com')
  })

  it('renders mixed markdown', () => {
    const { container } = render(<MarkdownContent content={'**Bold** and `code` and\n\n- item'} />)
    expect(screen.getByText('Bold').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(container.querySelector('li')).toBeTruthy()
  })

  it('wraps content in .ai-markdown container', () => {
    const { container } = render(<MarkdownContent content="Hello" />)
    expect(container.querySelector('.ai-markdown')).toBeTruthy()
  })

  it('renders plain text without crashing', () => {
    render(<MarkdownContent content="Just plain text" />)
    expect(screen.getByText('Just plain text')).toBeTruthy()
  })

  it('renders blockquotes', () => {
    const { container } = render(<MarkdownContent content="> A quote" />)
    const bq = container.querySelector('blockquote')
    expect(bq).toBeTruthy()
    expect(bq!.textContent).toContain('A quote')
  })

  describe('wikilinks', () => {
    it('preprocessWikilinks converts [[Target]] to markdown links', () => {
      expect(preprocessWikilinks('See [[My Note]]')).toBe('See [My Note](wikilink://My%20Note)')
      expect(preprocessWikilinks('[[A]] and [[B]]')).toBe('[A](wikilink://A) and [B](wikilink://B)')
      expect(preprocessWikilinks('`[[code]]`')).toBe('`[[code]]`')
      expect(preprocessWikilinks('![[Embedded Note]]')).toBe('![[Embedded Note]]')
    })

    it('renders [[Note Title]] as a clickable wikilink chip', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="Check out [[My Note]]" onWikilinkClick={onClick} />,
      )
      const wikilink = container.querySelector('.chat-wikilink')
      expect(wikilink).toBeTruthy()
      expect(wikilink!.textContent).toBe('My Note')
      expect(wikilink!.getAttribute('data-wikilink-target')).toBe('My Note')
    })

    it('fires onWikilinkClick when a wikilink is clicked after the native click stack settles', async () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="See [[Daily Log]]" onWikilinkClick={onClick} />,
      )
      const wikilink = container.querySelector('.chat-wikilink')!
      fireEvent.click(wikilink)

      expect(onClick).not.toHaveBeenCalled()

      await Promise.resolve()
      expect(onClick).toHaveBeenCalledWith('Daily Log')
    })

    it('consumes wikilink mouse events before outer editor listeners can observe stale nodes', () => {
      const onClick = vi.fn()
      const outerClick = vi.fn()
      const outerMouseDown = vi.fn()
      const { container } = render(
        <div data-testid="outer-host">
          <MarkdownContent content="See [[Daily Log]]" onWikilinkClick={onClick} />
        </div>,
      )
      const host = screen.getByTestId('outer-host')
      host.addEventListener('click', outerClick)
      host.addEventListener('mousedown', outerMouseDown)

      const wikilink = container.querySelector('.chat-wikilink')!
      const mouseDown = dispatchMouseEvent(wikilink, 'mousedown')
      const click = dispatchMouseEvent(wikilink, 'click')

      expect(mouseDown.defaultPrevented).toBe(true)
      expect(click.defaultPrevented).toBe(true)
      expect(outerMouseDown).not.toHaveBeenCalled()
      expect(outerClick).not.toHaveBeenCalled()
      expect(onClick).not.toHaveBeenCalled()
    })

    it('renders multiple wikilinks in the same paragraph', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="See [[Note A]] and [[Note B]]" onWikilinkClick={onClick} />,
      )
      const wikilinks = container.querySelectorAll('.chat-wikilink')
      expect(wikilinks).toHaveLength(2)
      expect(wikilinks[0].textContent).toBe('Note A')
      expect(wikilinks[1].textContent).toBe('Note B')
    })

    it('handles pipe syntax [[target|display]]', async () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="See [[path/to/note|My Display]]" onWikilinkClick={onClick} />,
      )
      const wikilink = container.querySelector('.chat-wikilink')!
      expect(wikilink.textContent).toBe('My Display')
      expect(wikilink.getAttribute('data-wikilink-target')).toBe('path/to/note')
      fireEvent.click(wikilink)

      await Promise.resolve()
      expect(onClick).toHaveBeenCalledWith('path/to/note')
    })

    it('does not render wikilinks inside inline code', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="Use `[[Not a link]]` syntax" onWikilinkClick={onClick} />,
      )
      expect(container.querySelector('.chat-wikilink')).toBeNull()
    })

    it('does not render wikilinks inside code blocks', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content={'```\n[[Not a link]]\n```'} onWikilinkClick={onClick} />,
      )
      expect(container.querySelector('.chat-wikilink')).toBeNull()
    })

    it('handles notes with special characters in title', async () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="Check [[Meeting — 2024/01/15]]" onWikilinkClick={onClick} />,
      )
      const wikilink = container.querySelector('.chat-wikilink')!
      expect(wikilink.textContent).toBe('Meeting — 2024/01/15')
      fireEvent.click(wikilink)

      await Promise.resolve()
      expect(onClick).toHaveBeenCalledWith('Meeting — 2024/01/15')
    })

    it('does not transform wikilinks when onWikilinkClick is not provided', () => {
      const { container } = render(
        <MarkdownContent content="See [[Some Note]]" />,
      )
      expect(container.querySelector('.chat-wikilink')).toBeNull()
      expect(container.textContent).toContain('[[Some Note]]')
    })

    it('does not transform embedded note syntax into a wikilink chip', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="See ![[Embedded Note]]" onWikilinkClick={onClick} />,
      )

      expect(container.querySelector('.chat-wikilink')).toBeNull()
      expect(container.textContent).toContain('![[Embedded Note]]')
    })

    it('renders wikilinks inside list items', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content={'- First [[Note A]]\n- Second [[Note B]]'} onWikilinkClick={onClick} />,
      )
      const wikilinks = container.querySelectorAll('.chat-wikilink')
      expect(wikilinks).toHaveLength(2)
    })

    it('has role="link" and tabIndex for accessibility', () => {
      const onClick = vi.fn()
      const { container } = render(
        <MarkdownContent content="See [[Accessible Note]]" onWikilinkClick={onClick} />,
      )
      const wikilink = container.querySelector('.chat-wikilink')!
      expect(wikilink.getAttribute('role')).toBe('link')
      expect(wikilink.getAttribute('tabindex')).toBe('0')
    })
  })
})
