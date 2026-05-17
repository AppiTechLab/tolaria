import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import { EmbeddedNoteBlock } from './EmbeddedNoteBlock'
import { TasksBlockContext } from './tasksBlockContext'

const noteContentCacheMock = vi.hoisted(() => ({
  getCachedNoteContentEntry: vi.fn(() => null),
  loadContentForOpen: vi.fn(),
}))

vi.mock('../hooks/noteContentCache', () => noteContentCacheMock)

function makeEntry(overrides: Partial<VaultEntry> = {}): VaultEntry {
  return {
    path: '/vault/embedded-note.md',
    title: 'Embedded Note',
    filename: 'embedded-note.md',
    folder: 'note',
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

describe('EmbeddedNoteBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads embedded note content, strips frontmatter and the leading H1, and keeps wikilinks clickable', async () => {
    noteContentCacheMock.loadContentForOpen.mockResolvedValueOnce([
      '---',
      'title: Embedded Note',
      '---',
      '',
      '# Embedded Note',
      '',
      'This is embedded content with [[Linked Note]].',
    ].join('\n'))

    const onNavigateWikilink = vi.fn()
    render(
      <TasksBlockContext.Provider
        value={{
          entries: [makeEntry()],
          locale: 'en',
          onNavigateWikilink,
          sourceEntry: makeEntry({ path: '/vault/source.md', title: 'Source Note', filename: 'source.md' }),
          vaultPath: '/vault',
        }}
      >
        <EmbeddedNoteBlock source="![[embedded-note]]" target="embedded-note" />
      </TasksBlockContext.Provider>,
    )

    expect(await screen.findByTestId('embedded-note-block')).toHaveTextContent('This is embedded content with Linked Note.')
    expect(screen.queryByRole('heading', { name: 'Embedded Note' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Embedded Note' }))
    expect(onNavigateWikilink).toHaveBeenCalledWith('embedded-note')

    fireEvent.click(screen.getByText('Linked Note'))
    expect(onNavigateWikilink).toHaveBeenCalledWith('Linked Note')
  })

  it('shows the unavailable state when the target note cannot be resolved', () => {
    render(
      <TasksBlockContext.Provider
        value={{
          entries: [],
          locale: 'en',
          onNavigateWikilink: vi.fn(),
          sourceEntry: undefined,
          vaultPath: '/vault',
        }}
      >
        <EmbeddedNoteBlock source="![[missing-note]]" target="missing-note" />
      </TasksBlockContext.Provider>,
    )

    expect(screen.getByText('Embedded note unavailable')).toBeInTheDocument()
  })
})