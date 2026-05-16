import { useCallback, useMemo, useState } from 'react'
import { Tag } from 'lucide-react'
import type { VaultEntry } from '../../types'
import type { FrontmatterValue } from '../Inspector'
import type { ParsedFrontmatter } from '../../utils/frontmatter'
import { translate, type AppLocale } from '../../lib/i18n'
import { getEffectiveDisplayMode, loadDisplayModeOverrides } from '../../utils/propertyTypes'
import { canonicalFrontmatterKey } from '../../utils/systemMetadata'
import { humanizePropertyKey } from '../../utils/propertyLabels'
import { TagPropertyValueCell } from '../PropertyValueCells'
import { containsWikilinks } from '../DynamicPropertiesPanel'
import {
  PROPERTY_PANEL_GRID_STYLE,
  PROPERTY_PANEL_LABEL_CLASS_NAME,
  PROPERTY_PANEL_ROW_STYLE,
} from '../propertyPanelLayout'
import { Separator } from '../ui/separator'

type TagGroup = {
  canonicalKey: string
  key: string
  hasProperty: boolean
  noteValue: FrontmatterValue
  readOnly: boolean
  vaultTags: string[]
}

function normalizeTagItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  return trimmed ? [trimmed] : []
}

function isTagProperty(
  key: string,
  value: FrontmatterValue,
  displayOverrides: ReturnType<typeof loadDisplayModeOverrides>,
): boolean {
  return !containsWikilinks(value) && getEffectiveDisplayMode(key, value, displayOverrides) === 'tags'
}

function mergeTagItems(currentValue: FrontmatterValue, nextValue: FrontmatterValue): string[] {
  const merged = normalizeTagItems(currentValue)
  for (const tag of normalizeTagItems(nextValue)) {
    if (!merged.includes(tag)) merged.push(tag)
  }
  return merged
}

function buildTagGroups(frontmatter: ParsedFrontmatter, entry: VaultEntry, entries: VaultEntry[]): TagGroup[] {
  const displayOverrides = loadDisplayModeOverrides()
  const groups = new Map<string, {
    key: string
    hasProperty: boolean
    noteValue: FrontmatterValue
    readOnly: boolean
    vaultSet: Set<string>
  }>()

  const ensureGroup = (key: string) => {
    const canonicalKey = canonicalFrontmatterKey(key)
    let group = groups.get(canonicalKey)
    if (!group) {
      group = {
        key,
        hasProperty: false,
        noteValue: [],
        readOnly: false,
        vaultSet: new Set<string>(),
      }
      groups.set(canonicalKey, group)
    }
    return { canonicalKey, group }
  }

  for (const [key, value] of Object.entries(frontmatter)) {
    if (!isTagProperty(key, value, displayOverrides)) continue
    const { group } = ensureGroup(key)
    group.key = key
    group.hasProperty = true
    group.noteValue = value
  }

  for (const [key, rawValue] of Object.entries(entry.properties ?? {})) {
    const value = rawValue as FrontmatterValue
    if (!isTagProperty(key, value, displayOverrides)) continue

    const noteTags = normalizeTagItems(value)
    if (noteTags.length === 0) continue

    const { group } = ensureGroup(key)
    group.key = key

    if (!group.hasProperty) {
      group.noteValue = noteTags
      group.readOnly = true
      continue
    }

    const mergedNoteValue = mergeTagItems(group.noteValue, value)
    if (mergedNoteValue.length !== normalizeTagItems(group.noteValue).length) {
      group.noteValue = mergedNoteValue
      group.readOnly = true
    }
  }

  for (const entry of entries) {
    if (!entry.properties) continue
    for (const [key, rawValue] of Object.entries(entry.properties)) {
      const value = rawValue as FrontmatterValue
      if (!isTagProperty(key, value, displayOverrides)) continue
      const tags = normalizeTagItems(value)
      if (tags.length === 0) continue
      const { group } = ensureGroup(key)
      for (const tag of tags) group.vaultSet.add(tag)
    }
  }

  return Array.from(groups.entries()).map(([canonicalKey, group]) => ({
    canonicalKey,
    key: group.key,
    hasProperty: group.hasProperty,
    noteValue: group.noteValue,
    readOnly: group.readOnly,
    vaultTags: Array.from(group.vaultSet).sort((left, right) => left.localeCompare(right)),
  }))
}

function toSavedTagValue(tags: string[]): FrontmatterValue {
  if (tags.length === 1) return tags[0]
  return tags
}

export function TagsPanel({
  entry,
  frontmatter,
  entries,
  onUpdateProperty,
  onDeleteProperty,
  onAddProperty,
  locale = 'en',
}: {
  entry: VaultEntry
  frontmatter: ParsedFrontmatter
  entries: VaultEntry[]
  onUpdateProperty?: (key: string, value: FrontmatterValue) => void
  onDeleteProperty?: (key: string) => void
  onAddProperty?: (key: string, value: FrontmatterValue) => void
  locale?: AppLocale
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const tagGroups = useMemo(() => buildTagGroups(frontmatter, entry, entries), [entry, frontmatter, entries])

  const handleSaveTags = useCallback((group: TagGroup, nextTags: string[]) => {
    setEditingKey(null)

    if (nextTags.length === 0) {
      if (group.hasProperty) onDeleteProperty?.(group.key)
      return
    }

    const nextValue = toSavedTagValue(nextTags)
    if (!group.hasProperty && onAddProperty) {
      onAddProperty(group.key, nextValue)
      return
    }

    onUpdateProperty?.(group.key, nextValue)
  }, [onAddProperty, onDeleteProperty, onUpdateProperty])

  if (tagGroups.length === 0) return null

  return (
    <>
      <Separator data-testid="inspector-properties-tags-separator" />
      <div data-testid="inspector-tags-panel">
        <h4 className="font-mono-overline mb-2 flex items-center gap-1 text-muted-foreground">
          <Tag size={12} className="shrink-0" />
          {translate(locale, 'inspector.tags.title')}
        </h4>
        <div className="grid min-w-0 gap-y-1.5" style={PROPERTY_PANEL_GRID_STYLE}>
          {tagGroups.map(group => (
            <div
              key={group.canonicalKey}
              className="grid min-w-0 items-center gap-2 px-1.5"
              style={PROPERTY_PANEL_ROW_STYLE}
              data-testid="inspector-tag-group"
            >
              <span className={PROPERTY_PANEL_LABEL_CLASS_NAME}>
                <span className="min-w-0 truncate">{humanizePropertyKey(group.key)}</span>
              </span>
              <div className="min-w-0">
                <TagPropertyValueCell
                  propKey={group.key}
                  value={group.noteValue}
                  isEditing={!group.readOnly && editingKey === group.key}
                  vaultTags={group.vaultTags}
                  showSuggestedTags={!group.readOnly}
                  readOnly={group.readOnly}
                  onSaveList={(_, nextTags) => handleSaveTags(group, nextTags)}
                  onStartEdit={setEditingKey}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}