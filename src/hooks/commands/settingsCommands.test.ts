import { describe, expect, it, vi } from 'vitest'
import { formatShortcutDisplay } from '../appCommandCatalog'
import { TOGGLE_GITIGNORED_VISIBILITY_EVENT } from '../../lib/gitignoredVisibilityEvents'
import { buildSettingsCommands } from './settingsCommands'

function findCommand(id: string, commands = buildSettingsCommands({ onOpenSettings: vi.fn() })) {
  return commands.find((item) => item.id === id)
}

function expectOpenSettingsCommand(id: string, label: string) {
  const onOpenSettings = vi.fn()
  const command = findCommand(id, buildSettingsCommands({ onOpenSettings }))

  expect(command).toMatchObject({
    label,
    enabled: true,
    group: 'Settings',
  })

  command?.execute()
  expect(onOpenSettings).toHaveBeenCalledTimes(1)
}

describe('buildSettingsCommands', () => {
  it('adds a discoverable H1 auto-rename settings command', () => {
    expectOpenSettingsCommand('open-h1-auto-rename-setting', 'Open H1 Auto-Rename Setting')
  })

  it('keeps the general settings command available', () => {
    const onOpenSettings = vi.fn()

    const commands = buildSettingsCommands({ onOpenSettings })

    expect(commands.find((item) => item.id === 'open-settings')).toMatchObject({
      label: 'Open Settings',
      shortcut: formatShortcutDisplay({ display: '⌘,' }),
      enabled: true,
    })
  })

  it('does not add language settings commands', () => {
    const commands = buildSettingsCommands({ onOpenSettings: vi.fn(), onSetUiLanguage: vi.fn() })

    expect(commands.find((item) => item.id === 'open-language-settings')).toBeUndefined()
    expect(commands.find((item) => item.id === 'use-system-language')).toBeUndefined()
    expect(commands.find((item) => item.id === 'switch-language-zh-cn')).toBeUndefined()
  })

  it('adds direct theme mode commands when a setter is available', () => {
    const onSetThemeMode = vi.fn()

    const commands = buildSettingsCommands({
      onOpenSettings: vi.fn(),
      onSetThemeMode,
    })

    const lightMode = commands.find((item) => item.id === 'use-light-mode')
    const darkMode = commands.find((item) => item.id === 'use-dark-mode')
    const systemMode = commands.find((item) => item.id === 'use-system-theme-mode')

    expect(lightMode).toMatchObject({
      label: 'Use Light Mode',
      enabled: true,
      group: 'Settings',
    })
    expect(lightMode?.keywords).toEqual(expect.arrayContaining(['theme', 'light mode']))
    expect(darkMode).toMatchObject({
      label: 'Use Dark Mode',
      enabled: true,
      group: 'Settings',
    })
    expect(darkMode?.keywords).toEqual(expect.arrayContaining(['theme', 'dark mode']))
    expect(systemMode).toMatchObject({
      label: 'Use System Theme',
      enabled: true,
      group: 'Settings',
    })
    expect(systemMode?.keywords).toEqual(expect.arrayContaining(['theme', 'system theme']))

    lightMode?.execute()
    darkMode?.execute()
    systemMode?.execute()

    expect(onSetThemeMode).toHaveBeenNthCalledWith(1, 'light')
    expect(onSetThemeMode).toHaveBeenNthCalledWith(2, 'dark')
    expect(onSetThemeMode).toHaveBeenNthCalledWith(3, 'system')
  })

  it('keeps theme mode commands visible but disabled until settings can be saved', () => {
    const commands = buildSettingsCommands({ onOpenSettings: vi.fn() })

    expect(commands.find((item) => item.id === 'use-light-mode')).toMatchObject({
      label: 'Use Light Mode',
      enabled: false,
    })
    expect(commands.find((item) => item.id === 'use-dark-mode')).toMatchObject({
      label: 'Use Dark Mode',
      enabled: false,
    })
    expect(commands.find((item) => item.id === 'use-system-theme-mode')).toMatchObject({
      label: 'Use System Theme',
      enabled: false,
    })
  })

  it('falls back to English command labels when a non-English locale is requested', () => {
    const commands = buildSettingsCommands({
      onOpenSettings: vi.fn(),
      locale: 'zh-CN',
    })

    expect(commands.find((item) => item.id === 'use-light-mode')).toMatchObject({
      label: 'Use Light Mode',
    })
    expect(commands.find((item) => item.id === 'use-system-theme-mode')).toMatchObject({
      label: 'Use System Theme',
    })
  })

  it('adds a create-empty-vault command when the handler is available', () => {
    const onOpenSettings = vi.fn()
    const onCreateEmptyVault = vi.fn()

    const commands = buildSettingsCommands({ onOpenSettings, onCreateEmptyVault })
    const command = commands.find((item) => item.id === 'create-empty-vault')

    expect(command).toMatchObject({
      label: 'Create Empty Vault…',
      enabled: true,
      group: 'Settings',
    })

    command?.execute()
    expect(onCreateEmptyVault).toHaveBeenCalledTimes(1)
  })

  it('adds a command palette toggle for Gitignored file visibility', () => {
    const onOpenSettings = vi.fn()
    const onToggleGitignoredFilesVisibility = vi.fn()

    const commands = buildSettingsCommands({
      onOpenSettings,
      onToggleGitignoredFilesVisibility,
    })
    const command = commands.find((item) => item.id === 'toggle-gitignored-files-visibility')

    expect(command).toMatchObject({
      label: 'Toggle Gitignored Files Visibility',
      enabled: true,
      group: 'Settings',
    })

    command?.execute()
    expect(onToggleGitignoredFilesVisibility).toHaveBeenCalledTimes(1)
  })

  it('dispatches the Gitignored visibility event when no direct handler is provided', () => {
    const listener = vi.fn()
    window.addEventListener(TOGGLE_GITIGNORED_VISIBILITY_EVENT, listener)

    findCommand('toggle-gitignored-files-visibility')?.execute()

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(TOGGLE_GITIGNORED_VISIBILITY_EVENT, listener)
  })

  it('makes external AI setup discoverable for Gemini CLI', () => {
    const onInstallMcp = vi.fn()
    const command = findCommand('install-mcp', buildSettingsCommands({
      onOpenSettings: vi.fn(),
      onInstallMcp,
    }))

    expect(command?.keywords).toContain('gemini')
    command?.execute()
    expect(onInstallMcp).toHaveBeenCalledOnce()
  })
})
