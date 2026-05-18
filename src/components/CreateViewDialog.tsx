import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterBuilder } from './FilterBuilder'
import type { FilterGroup, LabHomeGroupId, ResearchLabCustomSidebarGroup, ResearchLabDomainKey, ResearchLabModeConfig, ViewDefinition } from '../types'
import { translate, type AppLocale, type TranslationKey } from '../lib/i18n'
import { vaultRelativePathLabel } from '../utils/notePathIdentity'

type SaveViewResult = boolean | void
type SaveViewHandler = (definition: ViewDefinition) => SaveViewResult | Promise<SaveViewResult>
type InitialViewFormValues = Pick<ViewDefinition, 'name' | 'icon' | 'color' | 'filters' | 'labHomeGroup'>

const UNASSIGNED_LAB_HOME_GROUP = '__none__'

const LAB_HOME_GROUP_LABEL_KEYS: Record<ResearchLabDomainKey, TranslationKey> = {
  ongoingProjects: 'labHome.section.ongoingProjects.title',
  projectAcquisition: 'labHome.section.projectAcquisition.title',
  teaching: 'labHome.section.teaching.title',
  labManagement: 'labHome.section.labManagement.title',
}

interface LabHomeGroupOption {
  value: LabHomeGroupId
  label: string
}

function resolveCustomLabHomeGroupLabel(group: ResearchLabCustomSidebarGroup): string {
  const label = group.label?.trim()
  if (label) return label
  return vaultRelativePathLabel(group.folderPath)
}

function resolveLabHomeGroupOptions(
  researchLabMode: ResearchLabModeConfig | null | undefined,
  locale: AppLocale,
): LabHomeGroupOption[] {
  if (researchLabMode?.enabled !== true) return []

  return [
    ...Object.entries(LAB_HOME_GROUP_LABEL_KEYS).map(([value, labelKey]) => ({
      value,
      label: translate(locale, labelKey),
    })),
    ...(researchLabMode.customSidebarGroups ?? []).flatMap((group) => {
      const label = resolveCustomLabHomeGroupLabel(group)
      if (!label) return []
      return [{ value: group.id, label }]
    }),
  ]
}

interface CreateViewDialogProps {
  open: boolean
  onClose: () => void
  onCreate: SaveViewHandler
  availableFields: string[]
  locale?: AppLocale
  researchLabMode?: ResearchLabModeConfig | null
  /** When provided, the dialog operates in edit mode with pre-populated fields. */
  editingView?: ViewDefinition | null
}

interface CreateViewDialogFormProps {
  availableFields: string[]
  initialName: string
  initialIcon: string
  initialColor: string | null
  initialFilters: FilterGroup
  initialLabHomeGroup: LabHomeGroupId | null
  isEditing: boolean
  labHomeGroupOptions: LabHomeGroupOption[]
  locale: AppLocale
  showLabHomeGroupField: boolean
  onClose: () => void
  onCreate: SaveViewHandler
}

function CreateViewDialogForm({
  availableFields,
  initialName,
  initialIcon,
  initialColor,
  initialFilters,
  initialLabHomeGroup,
  isEditing,
  labHomeGroupOptions,
  locale,
  showLabHomeGroupField,
  onClose,
  onCreate,
}: CreateViewDialogFormProps) {
  const [name, setName] = useState(initialName)
  const [filters, setFilters] = useState<FilterGroup>(initialFilters)
  const [labHomeGroup, setLabHomeGroup] = useState<LabHomeGroupId | null>(initialLabHomeGroup)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return
    const trimmed = name.trim()
    if (!trimmed) return
    const definition: ViewDefinition = {
      name: trimmed,
      icon: initialIcon || null,
      color: initialColor,
      sort: null,
      ...(showLabHomeGroupField ? { labHomeGroup } : {}),
      filters,
    }
    setSaveError(null)
    setIsSaving(true)

    let shouldClose = false
    try {
      const result = await onCreate(definition)
      if (result === false) {
        setSaveError(translate(locale, 'viewDialog.saveError'))
      } else {
        shouldClose = true
      }
    } catch {
      setSaveError(translate(locale, 'viewDialog.saveError'))
    }

    setIsSaving(false)
    if (shouldClose) onClose()
  }

  const isCreateDisabled = !name.trim()

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{translate(locale, 'viewDialog.nameLabel')}</label>
        <Input
          ref={inputRef}
          placeholder={translate(locale, 'viewDialog.namePlaceholder')}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (saveError) setSaveError(null)
          }}
        />
      </div>
      {showLabHomeGroupField && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">{translate(locale, 'sidebar.nav.labHome')}</label>
          <Select
            value={labHomeGroup ?? UNASSIGNED_LAB_HOME_GROUP}
            onValueChange={(value) => {
              setLabHomeGroup(value === UNASSIGNED_LAB_HOME_GROUP ? null : value)
              if (saveError) setSaveError(null)
            }}
          >
            <SelectTrigger aria-label={translate(locale, 'sidebar.nav.labHome')} data-testid="view-dialog-lab-home-group" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED_LAB_HOME_GROUP}>{translate(locale, 'inspector.properties.none')}</SelectItem>
              {labHomeGroupOptions.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {saveError && (
        <p role="alert" className="text-xs text-destructive">{saveError}</p>
      )}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        <label className="text-xs font-medium text-muted-foreground">{translate(locale, 'viewDialog.filtersLabel')}</label>
        <FilterBuilder
          group={filters}
          onChange={setFilters}
          availableFields={availableFields}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          {translate(locale, 'common.cancel')}
        </Button>
        <Button type="submit" disabled={isCreateDisabled || isSaving}>
          {translate(locale, isEditing ? 'common.save' : 'common.create')}
        </Button>
      </DialogFooter>
    </form>
  )
}

function getInitialViewFormValues(
  editingView: ViewDefinition | null | undefined,
  availableFields: string[],
): InitialViewFormValues {
  return {
    name: editingView?.name ?? '',
    icon: editingView?.icon ?? '',
    color: editingView?.color ?? null,
    labHomeGroup: editingView?.labHomeGroup ?? null,
    filters: editingView?.filters ?? { all: [{ field: availableFields[0] ?? 'type', op: 'equals', value: '' }] },
  }
}

function getDialogDescription(isEditing: boolean): TranslationKey {
  return isEditing
    ? 'viewDialog.description.edit'
    : 'viewDialog.description.create'
}

export function CreateViewDialog({
  open,
  onClose,
  onCreate,
  availableFields,
  locale = 'en',
  researchLabMode = null,
  editingView,
}: CreateViewDialogProps) {
  const isEditing = !!editingView
  const initialValues = getInitialViewFormValues(editingView, availableFields)
  const labHomeGroupOptions = resolveLabHomeGroupOptions(researchLabMode, locale)
  const formKey = editingView
    ? `edit:${editingView.name}:${editingView.labHomeGroup ?? 'none'}`
    : `create:${availableFields[0] ?? 'type'}`

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent showCloseButton={false} className="flex max-h-[80vh] flex-col sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{translate(locale, isEditing ? 'viewDialog.title.edit' : 'viewDialog.title.create')}</DialogTitle>
          <DialogDescription className="sr-only">
            {translate(locale, getDialogDescription(isEditing))}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CreateViewDialogForm
            key={formKey}
            availableFields={availableFields}
            initialName={initialValues.name}
            initialIcon={initialValues.icon ?? ''}
            initialColor={initialValues.color}
            initialFilters={initialValues.filters}
            initialLabHomeGroup={initialValues.labHomeGroup ?? null}
            isEditing={isEditing}
            labHomeGroupOptions={labHomeGroupOptions}
            locale={locale}
            showLabHomeGroupField={researchLabMode?.enabled === true}
            onClose={onClose}
            onCreate={onCreate}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
