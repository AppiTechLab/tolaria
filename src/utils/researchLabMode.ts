import type {
  FolderNode,
  ResearchLabCustomSidebarGroup,
  ResearchLabDomainKey,
  ResearchLabFolderKey,
  ResearchLabModeConfig,
  ResearchLabModeFolders,
} from '../types'
import { normalizeVaultRelativePath } from './notePathIdentity'

export const DEFAULT_RESEARCH_LAB_MODE_FOLDERS: ResearchLabModeFolders = {
  ongoingProjects: 'Projects/Ongoing',
  projectAcquisition: 'Projects/Acquisition',
  teaching: 'Teaching',
  labManagement: 'Lab Management',
  templates: 'Templates',
  views: 'views',
  aiPrompts: 'AI Prompts',
  archive: 'Archive',
}

const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8',
  'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

export const RESEARCH_LAB_OPERATIONAL_KEYS = [
  'ongoingProjects',
  'projectAcquisition',
  'teaching',
  'labManagement',
] as const satisfies readonly ResearchLabFolderKey[]

const RESEARCH_LAB_DOMAIN_KEY_SET = new Set<ResearchLabDomainKey>([
  'ongoingProjects',
  'projectAcquisition',
  'teaching',
  'labManagement',
])

export const RESEARCH_LAB_SYSTEM_KEYS = [
  'templates',
  'views',
  'aiPrompts',
  'archive',
] as const satisfies readonly ResearchLabFolderKey[]

export const RESEARCH_LAB_FOLDER_KEYS = [
  ...RESEARCH_LAB_OPERATIONAL_KEYS,
  ...RESEARCH_LAB_SYSTEM_KEYS,
] as const satisfies readonly ResearchLabFolderKey[]

export type ResearchLabValidationCode =
  | 'empty'
  | 'absolute'
  | 'parentTraversal'
  | 'invalidSegment'
  | 'duplicate'
  | 'missing'

export interface ResearchLabValidationIssue {
  field: ResearchLabFolderKey
  code: ResearchLabValidationCode
  path: string
  otherField?: ResearchLabFolderKey
}

export interface ResearchLabValidationResult {
  errors: ResearchLabValidationIssue[]
  warnings: ResearchLabValidationIssue[]
}

function isResearchLabDomainKey(value: unknown): value is ResearchLabDomainKey {
  return typeof value === 'string' && RESEARCH_LAB_DOMAIN_KEY_SET.has(value as ResearchLabDomainKey)
}

function normalizeResearchLabHiddenSidebarGroups(
  hiddenSidebarGroups: readonly unknown[] | null | undefined,
): ResearchLabDomainKey[] {
  if (!Array.isArray(hiddenSidebarGroups)) return []

  const seen = new Set<ResearchLabDomainKey>()
  return hiddenSidebarGroups.flatMap((value) => {
    if (!isResearchLabDomainKey(value) || seen.has(value)) return []
    seen.add(value)
    return [value]
  })
}

function normalizeResearchLabCustomSidebarGroups(
  customSidebarGroups: readonly unknown[] | null | undefined,
): ResearchLabCustomSidebarGroup[] {
  if (!Array.isArray(customSidebarGroups)) return []

  const seenIds = new Set<string>()
  let nextId = 1

  return customSidebarGroups.flatMap((value) => {
    if (!value || typeof value !== 'object') return []

    const candidate = value as Partial<ResearchLabCustomSidebarGroup>
    const folderPath = normalizeVaultRelativePath(typeof candidate.folderPath === 'string' ? candidate.folderPath : '')
    if (!folderPath) return []

    const label = typeof candidate.label === 'string' ? candidate.label.trim() : ''
    let id = typeof candidate.id === 'string' ? candidate.id.trim() : ''

    if (!id || seenIds.has(id)) {
      while (seenIds.has(`custom-${nextId}`)) nextId += 1
      id = `custom-${nextId}`
      nextId += 1
    }

    seenIds.add(id)

    return [{
      id,
      label: label || null,
      folderPath,
    }]
  })
}

export function createDefaultResearchLabModeConfig(): ResearchLabModeConfig {
  return {
    enabled: false,
    folders: { ...DEFAULT_RESEARCH_LAB_MODE_FOLDERS },
    hiddenSidebarGroups: [],
    customSidebarGroups: [],
  }
}

export function normalizeResearchLabModeConfig(
  config: Partial<ResearchLabModeConfig> | null | undefined,
): ResearchLabModeConfig {
  const defaults = createDefaultResearchLabModeConfig()
  const nextFolders = (config?.folders ?? {}) as Partial<ResearchLabModeFolders>

  return {
    enabled: config?.enabled === true,
    folders: RESEARCH_LAB_FOLDER_KEYS.reduce<ResearchLabModeFolders>((result, key) => {
      const normalized = normalizeVaultRelativePath(nextFolders[key] ?? '')
      result[key] = normalized || defaults.folders[key]
      return result
    }, { ...defaults.folders }),
    hiddenSidebarGroups: normalizeResearchLabHiddenSidebarGroups(config?.hiddenSidebarGroups),
    customSidebarGroups: normalizeResearchLabCustomSidebarGroups(config?.customSidebarGroups),
  }
}

export function flattenResearchLabFolderPaths(nodes: FolderNode[]): string[] {
  return nodes.flatMap((node) => {
    const normalized = normalizeVaultRelativePath(node.path)
    return normalized
      ? [normalized, ...flattenResearchLabFolderPaths(node.children)]
      : flattenResearchLabFolderPaths(node.children)
  })
}

export function researchLabFolderExists(folderPath: string, existingFolderPaths: Iterable<string>): boolean {
  const normalizedTarget = normalizeVaultRelativePath(folderPath).toLocaleLowerCase()
  if (!normalizedTarget) return false

  for (const candidate of existingFolderPaths) {
    if (normalizeVaultRelativePath(candidate).toLocaleLowerCase() === normalizedTarget) {
      return true
    }
  }

  return false
}

export function validateResearchLabModeConfig(
  config: ResearchLabModeConfig,
  existingFolderPaths: Iterable<string> = [],
): ResearchLabValidationResult {
  if (!config.enabled) return { errors: [], warnings: [] }

  const errors: ResearchLabValidationIssue[] = []
  const warnings: ResearchLabValidationIssue[] = []
  const seen = new Map<string, ResearchLabFolderKey>()

  for (const key of RESEARCH_LAB_FOLDER_KEYS) {
    const rawPath = (config.folders[key] ?? '').replaceAll('\\', '/').trim()
    const pathError = validateResearchLabFolderPath(rawPath)

    if (pathError) {
      errors.push({ field: key, code: pathError, path: rawPath })
      continue
    }

    const normalizedPath = normalizeVaultRelativePath(rawPath)
    const duplicateKey = normalizedPath.toLocaleLowerCase()
    const otherField = seen.get(duplicateKey)
    if (otherField) {
      errors.push({ field: key, code: 'duplicate', path: normalizedPath, otherField })
      continue
    }

    seen.set(duplicateKey, key)

    if (!researchLabFolderExists(normalizedPath, existingFolderPaths)) {
      warnings.push({ field: key, code: 'missing', path: normalizedPath })
    }
  }

  return { errors, warnings }
}

function validateResearchLabFolderPath(path: string): Exclude<ResearchLabValidationCode, 'duplicate' | 'missing'> | null {
  if (!path) return 'empty'
  if (/^[a-z]:/iu.test(path) || path.startsWith('/') || path.startsWith('\\')) return 'absolute'

  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return 'empty'
  if (segments.some((segment) => segment === '.' || segment === '..')) return 'parentTraversal'
  if (segments.some(isInvalidPortableSegment)) return 'invalidSegment'
  return null
}

function isInvalidPortableSegment(segment: string): boolean {
  if (segment.trim() !== segment) return true
  if (segment.endsWith('.') || segment.endsWith(' ')) return true
  if (/[<>:"\\|?*]/u.test(segment)) return true
  if (containsControlCharacter(segment)) return true

  const windowsDevice = segment.split('.')[0]?.toLocaleUpperCase() ?? segment.toLocaleUpperCase()
  return WINDOWS_RESERVED_DEVICE_NAMES.has(windowsDevice)
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint !== undefined && codePoint <= 0x1f) return true
  }

  return false
}