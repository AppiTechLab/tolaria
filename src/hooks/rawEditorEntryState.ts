import type { VaultEntry, VaultPropertyValue } from '../types'
import { parseFrontmatter } from '../utils/frontmatter'
import { extractInlineTags } from '../utils/wikilinks'
import { frontmatterToEntryPatch } from './frontmatterOps'

function createRawEditorEntryState(): Partial<VaultEntry> {
  return {
    aliases: [],
    archived: false,
    belongsTo: [],
    color: null,
    favorite: false,
    favoriteIndex: null,
    icon: null,
    isA: null,
    listPropertiesDisplay: [],
    order: null,
    organized: false,
    properties: {},
    relatedTo: [],
    relationships: {},
    sidebarLabel: null,
    sort: null,
    status: null,
    template: null,
    view: null,
    visible: null,
  }
}

function mergeRelationships(target: Record<string, string[]>, source: Record<string, string[] | null> | null): void {
  if (!source) return
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value) && value.length > 0) Reflect.set(target, key, value)
  }
}

function mergeProperties(
  target: Record<string, VaultPropertyValue>,
  source: Record<string, VaultPropertyValue> | null,
): void {
  if (!source) return
  for (const [key, value] of Object.entries(source)) {
    if (value !== null) Reflect.set(target, key, value)
  }
}

function normalizeTagItems(value: VaultPropertyValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  return trimmed ? [trimmed] : []
}

function mergeInlineTags(content: string, target: Record<string, VaultPropertyValue>): void {
  const inlineTags = extractInlineTags(content)
  if (inlineTags.length === 0) return

  const existingTagKey = Object.keys(target).find(key => key.trim().toLowerCase() === 'tags')
  const tagKey = existingTagKey ?? 'Tags'
  const merged = normalizeTagItems(Reflect.get(target, tagKey) as VaultPropertyValue | undefined)

  for (const tag of inlineTags) {
    if (!merged.includes(tag)) merged.push(tag)
  }

  Reflect.set(target, tagKey, merged)
}

export function deriveRawEditorEntryState(content: string): Partial<VaultEntry> {
  const derived = createRawEditorEntryState()
  const properties: Record<string, VaultPropertyValue> = {}
  const relationships: Record<string, string[]> = {}

  for (const [key, value] of Object.entries(parseFrontmatter(content))) {
    const { patch, relationshipPatch, propertiesPatch } = frontmatterToEntryPatch('update', key, value)
    Object.assign(derived, patch)
    mergeRelationships(relationships, relationshipPatch)
    mergeProperties(properties, propertiesPatch)
  }

  mergeInlineTags(content, properties)

  derived.properties = properties
  derived.relationships = relationships
  return derived
}
