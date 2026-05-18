import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CreateViewDialog } from './CreateViewDialog'
import type { ResearchLabModeConfig, ViewDefinition } from '../types'

const DIALOG_TEST_TIMEOUT_MS = 10_000

describe('CreateViewDialog', () => {
  const researchLabMode: ResearchLabModeConfig = {
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
    },
    hiddenSidebarGroups: [],
    customSidebarGroups: [],
  }

  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onCreate: vi.fn(),
    availableFields: ['type', 'status', 'title'],
  }

  function makeEditingView(overrides: Partial<ViewDefinition> = {}): ViewDefinition {
    return {
      name: 'Active Projects',
      icon: 'rocket',
      color: null,
      sort: null,
      filters: { all: [{ field: 'type', op: 'equals', value: 'Project' }] },
      ...overrides,
    }
  }

  it('shows "Create View" title in create mode', () => {
    render(<CreateViewDialog {...defaultProps} />)
    expect(screen.getByText('Create View')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
  }, DIALOG_TEST_TIMEOUT_MS)

  it('shows "Edit View" title when editingView is provided', () => {
    render(<CreateViewDialog {...defaultProps} editingView={makeEditingView()} />)
    expect(screen.getByText('Edit View')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('keeps the Lab Home assignment control hidden outside research lab mode', () => {
    render(<CreateViewDialog {...defaultProps} editingView={makeEditingView()} />)
    expect(screen.queryByRole('combobox', { name: 'Lab Home' })).not.toBeInTheDocument()
  })

  it('pre-populates name field in edit mode', () => {
    render(<CreateViewDialog {...defaultProps} editingView={makeEditingView()} />)
    const input = screen.getByPlaceholderText(/Active Projects|Reading List/i)
    expect(input).toHaveValue('Active Projects')
  })

  it('preserves existing icon and markdown-defined color when editing a view', async () => {
    const onCreate = vi.fn()
    const editingView = makeEditingView({ name: 'Monday', icon: 'folder', color: 'blue' })
    render(<CreateViewDialog {...defaultProps} onCreate={onCreate} editingView={editingView} />)

    expect(screen.queryByText('Color')).not.toBeInTheDocument()
    expect(screen.queryByText('Icon')).not.toBeInTheDocument()

    // Submit the form without changing anything
    fireEvent.submit(screen.getByText('Save').closest('form')!)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ icon: 'folder', color: 'blue' })
      )
    })
  })

  it('allows assigning a saved view to a Lab Home group in research lab mode', async () => {
    const onCreate = vi.fn()
    render(
      <CreateViewDialog
        {...defaultProps}
        onCreate={onCreate}
        researchLabMode={researchLabMode}
        editingView={makeEditingView()}
      />,
    )

    const trigger = screen.getByTestId('view-dialog-lab-home-group')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: 'Teaching' }))
    fireEvent.submit(screen.getByText('Save').closest('form')!)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ labHomeGroup: 'teaching' }),
      )
    })
  })

  it('allows assigning a saved view to a custom Lab Home group', async () => {
    const onCreate = vi.fn()
    render(
      <CreateViewDialog
        {...defaultProps}
        onCreate={onCreate}
        researchLabMode={{
          ...researchLabMode,
          customSidebarGroups: [{ id: 'custom-1', label: 'Grant Pipeline', folderPath: 'Projects/Grants' }],
        }}
        editingView={makeEditingView()}
      />,
    )

    const trigger = screen.getByTestId('view-dialog-lab-home-group')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: 'Grant Pipeline' }))
    fireEvent.submit(screen.getByText('Save').closest('form')!)

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ labHomeGroup: 'custom-1' }),
      )
    })
  })

  it('keeps appearance controls out of the create dialog', async () => {
    const onCreate = vi.fn()
    render(<CreateViewDialog {...defaultProps} onCreate={onCreate} />)
    const input = screen.getByPlaceholderText(/Active Projects|Reading List/i)
    fireEvent.change(input, { target: { value: 'Test View' } })

    expect(screen.queryByPlaceholderText('Search icons…')).not.toBeInTheDocument()
    expect(screen.queryByText('Color')).not.toBeInTheDocument()
    expect(screen.queryByText('Icon')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    const definition = onCreate.mock.calls[0][0] as ViewDefinition
    expect(definition.icon).toBeNull()
    expect(definition.color).toBeNull()
  })

  it('passes null icon and color when no appearance is selected', async () => {
    const onCreate = vi.fn()
    render(<CreateViewDialog {...defaultProps} onCreate={onCreate} />)
    const input = screen.getByPlaceholderText(/Active Projects|Reading List/i)
    fireEvent.change(input, { target: { value: 'No Icon View' } })
    fireEvent.submit(screen.getByText('Create').closest('form')!)
    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ icon: null, color: null })
      )
    })
  })

  it('keeps the dialog open when async save reports failure', async () => {
    const onClose = vi.fn()
    const onCreate = vi.fn(async () => false)
    render(<CreateViewDialog {...defaultProps} onClose={onClose} onCreate={onCreate} />)
    const input = screen.getByPlaceholderText(/Active Projects|Reading List/i)
    fireEvent.change(input, { target: { value: 'Unsaveable View' } })

    fireEvent.click(screen.getByText('Create'))

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Create View')).toBeInTheDocument()
  })
})
