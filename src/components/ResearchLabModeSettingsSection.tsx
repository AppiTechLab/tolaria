import type { TranslationKey, TranslationValues } from '../lib/i18n'
import type {
  FolderNode,
  ResearchLabCustomSidebarGroup,
  ResearchLabDomainKey,
  ResearchLabFolderKey,
  ResearchLabModeConfig,
} from '../types'
import {
  RESEARCH_LAB_OPERATIONAL_KEYS,
  RESEARCH_LAB_SYSTEM_KEYS,
  type ResearchLabValidationIssue,
  type ResearchLabValidationResult,
} from '../utils/researchLabMode'
import { normalizeVaultRelativePath, vaultRelativePathLabel } from '../utils/notePathIdentity'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  SectionHeading,
  SelectControl,
  SettingsGroup,
  SettingsGroupItem,
  SettingsSwitchRow,
} from './SettingsControls'

type Translate = (key: TranslationKey, values?: TranslationValues) => string

interface ResearchLabModeSettingsSectionProps {
  t: Translate
  config: ResearchLabModeConfig
  folders: FolderNode[]
  validation: ResearchLabValidationResult | null
  onChange: (config: ResearchLabModeConfig) => void
  onValidate: () => void
  onReset: () => void
}

const FIELD_LABEL_KEYS: Record<ResearchLabFolderKey, TranslationKey> = {
  ongoingProjects: 'labHome.section.ongoingProjects.title',
  projectAcquisition: 'labHome.section.projectAcquisition.title',
  teaching: 'labHome.section.teaching.title',
  labManagement: 'labHome.section.labManagement.title',
  templates: 'settings.researchLabMode.folder.templates',
  views: 'settings.researchLabMode.folder.views',
  aiPrompts: 'settings.researchLabMode.folder.aiPrompts',
  archive: 'settings.researchLabMode.folder.archive',
}

function flattenFolderPaths(nodes: FolderNode[]): string[] {
  return nodes.flatMap((node) => {
    const normalized = normalizeVaultRelativePath(node.path)
    return normalized ? [normalized, ...flattenFolderPaths(node.children)] : flattenFolderPaths(node.children)
  })
}

function buildFolderOptions(currentPath: string, folderPaths: string[]): Array<{ value: string; label: string }> {
  const uniquePaths = new Set<string>()
  const normalizedCurrentPath = normalizeVaultRelativePath(currentPath) || currentPath.replaceAll('\\', '/').trim()
  const values = normalizedCurrentPath ? [normalizedCurrentPath, ...folderPaths] : folderPaths

  return values.flatMap((value) => {
    if (!value || uniquePaths.has(value)) return []
    uniquePaths.add(value)
    return [{ value, label: value }]
  })
}

function validationIssuesForField(
  field: ResearchLabFolderKey,
  validation: ResearchLabValidationResult | null,
): ResearchLabValidationIssue[] {
  if (!validation) return []
  return [...validation.errors, ...validation.warnings].filter((issue) => issue.field === field)
}

function validationSummary(t: Translate, validation: ResearchLabValidationResult | null): string | null {
  if (!validation) return null
  if (validation.errors.length === 0 && validation.warnings.length === 0) return t('settings.researchLabMode.validationValid')
  if (validation.errors.length > 0) return t('settings.researchLabMode.validationIssues')
  return t('settings.researchLabMode.validationWarnings')
}

function validationSummaryClass(validation: ResearchLabValidationResult | null): string {
  if (!validation) return 'text-muted-foreground'
  if (validation.errors.length > 0) return 'text-destructive'
  if (validation.warnings.length > 0) return 'text-amber-700 dark:text-amber-400'
  return 'text-emerald-700 dark:text-emerald-400'
}

function issueText(t: Translate, issue: ResearchLabValidationIssue): string {
  if (issue.code === 'duplicate') {
    return t('settings.researchLabMode.issue.duplicate', {
      label: issue.otherField ? t(FIELD_LABEL_KEYS[issue.otherField]) : issue.path,
    })
  }

  if (issue.code === 'missing') return t('settings.researchLabMode.issue.missing')
  if (issue.code === 'empty') return t('settings.researchLabMode.issue.empty')
  if (issue.code === 'absolute') return t('settings.researchLabMode.issue.absolute')
  if (issue.code === 'parentTraversal') return t('settings.researchLabMode.issue.parentTraversal')
  return t('settings.researchLabMode.issue.invalidSegment')
}

function fieldIssueClass(issue: ResearchLabValidationIssue): string {
  return issue.code === 'missing'
    ? 'text-amber-700 dark:text-amber-400'
    : 'text-destructive'
}

function setBuiltInSidebarGroupVisibility(
  config: ResearchLabModeConfig,
  field: ResearchLabDomainKey,
  visible: boolean,
): ResearchLabModeConfig {
  const hidden = new Set(config.hiddenSidebarGroups ?? [])

  if (visible) hidden.delete(field)
  else hidden.add(field)

  return {
    ...config,
    hiddenSidebarGroups: (RESEARCH_LAB_OPERATIONAL_KEYS as readonly ResearchLabDomainKey[])
      .filter((key) => hidden.has(key)),
  }
}

function nextCustomSidebarGroupId(groups: readonly ResearchLabCustomSidebarGroup[]): string {
  const usedIds = new Set(groups.map((group) => group.id))
  let nextId = 1
  while (usedIds.has(`custom-${nextId}`)) nextId += 1
  return `custom-${nextId}`
}

function customSidebarGroupLabel(group: ResearchLabCustomSidebarGroup): string {
  const label = typeof group.label === 'string' ? group.label.trim() : ''
  if (label) return label
  return vaultRelativePathLabel(group.folderPath)
}

function ResearchLabFolderField({
  config,
  field,
  folderPaths,
  issues,
  onChange,
  t,
}: {
  config: ResearchLabModeConfig
  field: ResearchLabFolderKey
  folderPaths: string[]
  issues: ResearchLabValidationIssue[]
  onChange: (config: ResearchLabModeConfig) => void
  t: Translate
}) {
  const label = t(FIELD_LABEL_KEYS[field])
  const value = config.folders[field]

  const updateValue = (nextValue: string) => {
    onChange({
      ...config,
      folders: {
        ...config.folders,
        [field]: nextValue.replaceAll('\\', '/'),
      },
    })
  }

  return (
    <SettingsGroupItem testId={`settings-research-lab-${field}`}>
      <div className="space-y-3">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)]">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground" htmlFor={`settings-research-lab-${field}-path`}>
              {t('settings.researchLabMode.pathLabel')}
            </label>
            <Input
              id={`settings-research-lab-${field}-path`}
              value={value}
              onChange={(event) => updateValue(event.target.value)}
              aria-label={t('settings.researchLabMode.pathAria', { label })}
              data-testid={`settings-research-lab-${field}-path`}
              className="bg-transparent font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">{t('settings.researchLabMode.pickExisting')}</div>
            <SelectControl
              value={normalizeVaultRelativePath(value) || value || folderPaths[0] || ''}
              onValueChange={updateValue}
              options={buildFolderOptions(value, folderPaths)}
              testId={`settings-research-lab-${field}-select`}
              ariaLabel={t('settings.researchLabMode.pickExistingAria', { label })}
            />
          </div>
        </div>
        {issues.length > 0 && (
          <div className="space-y-1">
            {issues.map((issue, index) => (
              <div key={`${issue.code}-${index}`} className={`text-xs leading-5 ${fieldIssueClass(issue)}`}>
                {issueText(t, issue)}
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsGroupItem>
  )
}

function ResearchLabCustomSidebarGroupField({
  config,
  folderPaths,
  group,
  index,
  onChange,
  t,
}: {
  config: ResearchLabModeConfig
  folderPaths: string[]
  group: ResearchLabCustomSidebarGroup
  index: number
  onChange: (config: ResearchLabModeConfig) => void
  t: Translate
}) {
  const resolvedLabel = customSidebarGroupLabel(group) || t('sidebar.nav.labHome')

  const updateGroup = (patch: Partial<ResearchLabCustomSidebarGroup>) => {
    const nextGroups = [...(config.customSidebarGroups ?? [])]
    nextGroups[index] = {
      ...nextGroups[index],
      ...patch,
    }

    onChange({
      ...config,
      customSidebarGroups: nextGroups,
    })
  }

  const removeGroup = () => {
    onChange({
      ...config,
      customSidebarGroups: (config.customSidebarGroups ?? []).filter((_, groupIndex) => groupIndex !== index),
    })
  }

  return (
    <SettingsGroupItem testId={`settings-research-lab-custom-sidebar-${index}`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.75fr)_auto]">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor={`settings-research-lab-custom-sidebar-${group.id}-label`}>
            {t('settings.workspaces.label')}
          </label>
          <Input
            id={`settings-research-lab-custom-sidebar-${group.id}-label`}
            value={group.label ?? ''}
            onChange={(event) => updateGroup({ label: event.target.value })}
            data-testid={`settings-research-lab-custom-sidebar-${index}-label`}
            placeholder={vaultRelativePathLabel(group.folderPath)}
            className="bg-transparent"
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">{t('settings.researchLabMode.pickExisting')}</div>
          <SelectControl
            value={normalizeVaultRelativePath(group.folderPath) || group.folderPath || folderPaths[0] || ''}
            onValueChange={(value) => updateGroup({ folderPath: value })}
            options={buildFolderOptions(group.folderPath, folderPaths)}
            testId={`settings-research-lab-custom-sidebar-${index}-path`}
            ariaLabel={t('settings.researchLabMode.pickExistingAria', { label: resolvedLabel })}
          />
        </div>
        <div className="flex items-end justify-end">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            data-testid={`settings-research-lab-custom-sidebar-${index}-remove`}
            onClick={removeGroup}
          >
            {t('common.remove')}
          </Button>
        </div>
      </div>
    </SettingsGroupItem>
  )
}

export function ResearchLabModeSettingsSection({
  t,
  config,
  folders,
  validation,
  onChange,
  onValidate,
  onReset,
}: ResearchLabModeSettingsSectionProps) {
  const folderPaths = flattenFolderPaths(folders).sort((left, right) => left.localeCompare(right))
  const summary = validationSummary(t, validation)
  const customSidebarGroups = config.customSidebarGroups ?? []

  const addCustomSidebarGroup = () => {
    const defaultFolderPath = folderPaths[0]
    if (!defaultFolderPath) return

    onChange({
      ...config,
      customSidebarGroups: [
        ...customSidebarGroups,
        {
          id: nextCustomSidebarGroupId(customSidebarGroups),
          label: null,
          folderPath: defaultFolderPath,
        },
      ],
    })
  }

  return (
    <>
      <SectionHeading title={t('settings.researchLabMode.title')} />
      <SettingsGroup>
        <SettingsSwitchRow
          label={t('settings.researchLabMode.enable')}
          description={t('settings.researchLabMode.enableDescription')}
          checked={config.enabled}
          onChange={(enabled) => onChange({ ...config, enabled })}
          testId="settings-research-lab-mode-enabled"
        />
        {config.enabled && (
          <>
            <SettingsGroupItem testId="settings-research-lab-mode-actions">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">{t('settings.researchLabMode.configure')}</div>
                  <div className="text-xs leading-5 text-muted-foreground">{t('settings.researchLabMode.configureDescription')}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" variant="secondary" onClick={onValidate}>
                    {t('settings.researchLabMode.validate')}
                  </Button>
                  <Button type="button" size="xs" variant="ghost" onClick={onReset}>
                    {t('settings.researchLabMode.resetDefaults')}
                  </Button>
                </div>
              </div>
              {summary && (
                <div className={`mt-3 text-xs leading-5 ${validationSummaryClass(validation)}`}>{summary}</div>
              )}
            </SettingsGroupItem>
            <SettingsGroupItem>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('settings.researchLabMode.operationalFolders')}
              </div>
            </SettingsGroupItem>
            {RESEARCH_LAB_OPERATIONAL_KEYS.map((field) => (
              <ResearchLabFolderField
                key={field}
                config={config}
                field={field}
                folderPaths={folderPaths}
                issues={validationIssuesForField(field, validation)}
                onChange={onChange}
                t={t}
              />
            ))}
            <SettingsGroupItem>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t('settings.researchLabMode.systemFolders')}
              </div>
            </SettingsGroupItem>
            {RESEARCH_LAB_SYSTEM_KEYS.map((field) => (
              <ResearchLabFolderField
                key={field}
                config={config}
                field={field}
                folderPaths={folderPaths}
                issues={validationIssuesForField(field, validation)}
                onChange={onChange}
                t={t}
              />
            ))}
            <SettingsGroupItem testId="settings-research-lab-sidebar-groups">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{t('sidebar.nav.labHome')}</div>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  data-testid="settings-research-lab-custom-sidebar-add"
                  onClick={addCustomSidebarGroup}
                  disabled={folderPaths.length === 0}
                >
                  {t('inspector.relationship.add')}
                </Button>
              </div>
            </SettingsGroupItem>
            {(RESEARCH_LAB_OPERATIONAL_KEYS as readonly ResearchLabDomainKey[]).map((field) => (
              <SettingsSwitchRow
                key={`sidebar-toggle-${field}`}
                label={t(FIELD_LABEL_KEYS[field])}
                description={config.folders[field]}
                checked={!(config.hiddenSidebarGroups ?? []).includes(field)}
                onChange={(visible) => onChange(setBuiltInSidebarGroupVisibility(config, field, visible))}
                testId={`settings-research-lab-sidebar-toggle-${field}`}
              />
            ))}
            {customSidebarGroups.map((group, index) => (
              <ResearchLabCustomSidebarGroupField
                key={group.id}
                config={config}
                folderPaths={folderPaths}
                group={group}
                index={index}
                onChange={onChange}
                t={t}
              />
            ))}
          </>
        )}
      </SettingsGroup>
    </>
  )
}