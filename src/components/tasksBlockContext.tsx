import { createContext } from 'react'
import type { AppLocale } from '../lib/i18n'
import type { VaultEntry } from '../types'

export interface TasksBlockContextValue {
  entries: VaultEntry[]
  locale: AppLocale
  onNavigateWikilink: (target: string) => void
  sourceEntry?: VaultEntry
  vaultPath?: string
}

export const TasksBlockContext = createContext<TasksBlockContextValue>({
  entries: [],
  locale: 'en',
  onNavigateWikilink: () => {},
  sourceEntry: undefined,
  vaultPath: undefined,
})