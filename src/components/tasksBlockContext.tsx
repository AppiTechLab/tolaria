import { createContext } from 'react'
import type { AppLocale } from '../lib/i18n'
import type { VaultEntry } from '../types'

export interface TasksBlockContextValue {
  entries: VaultEntry[]
  locale: AppLocale
  onNavigateWikilink: (target: string) => void
  vaultPath?: string
}

export const TasksBlockContext = createContext<TasksBlockContextValue>({
  entries: [],
  locale: 'en',
  onNavigateWikilink: () => {},
  vaultPath: undefined,
})