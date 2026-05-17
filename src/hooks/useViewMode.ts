import { useState, useCallback, useEffect } from 'react'
import { getAppStorageItem } from '../constants/appStorage'
import { getVaultConfig, updateVaultConfigField, subscribeVaultConfig } from '../utils/vaultConfigStore'

export type ViewMode = 'editor-only' | 'editor-list' | 'editor-sidebar' | 'all'

function isViewMode(v: string | null | undefined): v is ViewMode {
  return v === 'editor-only' || v === 'editor-list' || v === 'editor-sidebar' || v === 'all'
}

export function getViewModeVisibility(viewMode: ViewMode) {
  return {
    sidebarVisible: viewMode === 'all' || viewMode === 'editor-sidebar',
    noteListVisible: viewMode === 'all' || viewMode === 'editor-list',
  }
}

function loadViewMode(): ViewMode {
  const stored = getVaultConfig().view_mode
  if (isViewMode(stored)) return stored
  // Fallback to localStorage during initial load (before vault config is ready)
  const ls = getAppStorageItem('viewMode')
  if (isViewMode(ls)) return ls
  return 'all'
}

export function useViewMode(initialOverride?: ViewMode) {
  const [viewMode, setViewModeState] = useState<ViewMode>(initialOverride ?? loadViewMode)

  // Re-sync when vault config becomes available
  useEffect(() => {
    return subscribeVaultConfig(() => {
      const stored = getVaultConfig().view_mode
      if (isViewMode(stored)) setViewModeState(stored)
    })
  }, [])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    updateVaultConfigField('view_mode', mode)
  }, [])

  const { sidebarVisible, noteListVisible } = getViewModeVisibility(viewMode)

  return { viewMode, setViewMode, sidebarVisible, noteListVisible }
}
