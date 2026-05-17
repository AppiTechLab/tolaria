import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarTitleBar } from './SidebarSections'

function renderTitleBar(overrides: Partial<ComponentProps<typeof SidebarTitleBar>> = {}) {
  return render(<SidebarTitleBar {...overrides} />, { wrapper: TooltipProvider })
}

describe('SidebarTitleBar', () => {
  it('renders sidebar and history controls with shortcut tooltips', () => {
    const onCollapse = vi.fn()
    const onToggleNoteList = vi.fn()
    const onGoBack = vi.fn()
    const onGoForward = vi.fn()

    renderTitleBar({
      onCollapse,
      onToggleNoteList,
      onGoBack,
      onGoForward,
      canGoBack: true,
      canGoForward: false,
    })

    const collapse = screen.getByRole('button', { name: 'Collapse sidebar' })
    const hideNoteList = screen.getByRole('button', { name: 'Hide note list' })
    const back = screen.getByRole('button', { name: 'Go Back' })
    const forward = screen.getByRole('button', { name: 'Go Forward' })

    expect(collapse).toHaveAttribute('title', expect.stringMatching(/^Collapse sidebar \((⌘|Ctrl\+)2\)$/))
    expect(hideNoteList).toHaveAttribute('title', 'Hide note list')
    expect(back).toHaveAttribute('title', expect.stringMatching(/^Go Back \((⌘←|Ctrl\+Left)\)$/))
    expect(forward).toHaveAttribute('title', expect.stringMatching(/^Go Forward \((⌘→|Ctrl\+Right)\)$/))
    expect(forward).toBeDisabled()

    fireEvent.click(collapse)
    fireEvent.click(hideNoteList)
    fireEvent.click(back)
    fireEvent.click(forward)

    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(onToggleNoteList).toHaveBeenCalledTimes(1)
    expect(onGoBack).toHaveBeenCalledTimes(1)
    expect(onGoForward).not.toHaveBeenCalled()
  })

  it('switches the note-list control label when the note list is collapsed', () => {
    renderTitleBar({ onToggleNoteList: vi.fn(), noteListCollapsed: true })

    expect(screen.getByRole('button', { name: 'Show note list' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide note list' })).not.toBeInTheDocument()
  })

  it('omits controls when sidebar callbacks are absent', () => {
    renderTitleBar()

    expect(screen.queryByRole('button', { name: 'Collapse sidebar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go Back' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go Forward' })).not.toBeInTheDocument()
  })
})
