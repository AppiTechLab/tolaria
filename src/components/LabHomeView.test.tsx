import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FolderNode, VaultEntry } from '../types'
import { LabHomeView } from './LabHomeView'

function makeFolder(path: string): FolderNode {
  const segments = path.split('/').filter(Boolean)
  return {
    name: segments.at(-1) ?? path,
    path,
    children: [],
  }
}

function makeEntry(relativePath: string, title: string): VaultEntry {
  return {
    path: `/vault/${relativePath}`,
    filename: relativePath.split('/').at(-1) ?? relativePath,
    title,
    isA: null,
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: null,
    createdAt: null,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    noteWidth: null,
    visible: null,
    organized: true,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: true,
    fileKind: 'markdown',
  }
}

function makeResearchLabMode(overrides: Record<string, string> = {}) {
  return {
    enabled: true,
    folders: {
      ongoingProjects: 'Projects/Ongoing',
      projectAcquisition: 'Projects/Acquisition',
      teaching: 'Teaching',
      labManagement: 'Lab Management',
      templates: 'Templates',
      views: 'views',
      aiPrompts: 'AI Prompts',
      archive: 'Archive',
      ...overrides,
    },
  }
}

describe('LabHomeView', () => {
  it('renders notes from configured folders and opens the mapped folder', () => {
    const onOpenFolder = vi.fn()

    render(
      <LabHomeView
        {...({
          locale: 'en',
          rootPath: '/vault',
          entries: [makeEntry('Projects/Active/alpha-project.md', 'Alpha Project')],
          folders: [makeFolder('Projects/Active')],
          researchLabMode: makeResearchLabMode({ ongoingProjects: 'Projects/Active' }),
          onOpenFolder,
        } as never)}
      />,
    )

    expect(screen.getByText('Projects/Active')).toBeInTheDocument()
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('lab-home-open-folder-ongoingProjects'))

    expect(onOpenFolder).toHaveBeenCalledWith('Projects/Active')
  })

  it('shows a missing-folder state and lets the user create the configured folder', () => {
    const onCreateFolder = vi.fn()

    render(
      <LabHomeView
        {...({
          locale: 'en',
          rootPath: '/vault',
          entries: [],
          folders: [],
          researchLabMode: makeResearchLabMode({ ongoingProjects: 'Projects/Missing' }),
          onOpenFolder: vi.fn(),
          onCreateFolder,
        } as never)}
      />,
    )

    const ongoingProjectsCard = screen.getByTestId('lab-home-section-ongoing-projects')

    expect(within(ongoingProjectsCard).getByText('Projects/Missing')).toBeInTheDocument()
    expect(within(ongoingProjectsCard).getByText('Folder not found in this workspace.')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('lab-home-create-folder-ongoingProjects'))

    expect(onCreateFolder).toHaveBeenCalledWith('Projects/Missing')
  })
})