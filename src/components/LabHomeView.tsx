import type { AppLocale } from '../lib/i18n'
import { translate } from '../lib/i18n'
import type { FolderNode, ResearchLabModeConfig, VaultEntry } from '../types'
import { filterEntries } from '../utils/noteListHelpers'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader } from './ui/card'
import {
  flattenResearchLabFolderPaths,
  researchLabFolderExists,
} from '../utils/researchLabMode'

const LAB_HOME_SECTIONS = [
  {
    key: 'ongoingProjects',
    id: 'ongoing-projects',
    titleKey: 'labHome.section.ongoingProjects.title',
    emptyKey: 'labHome.section.ongoingProjects.empty',
  },
  {
    key: 'projectAcquisition',
    id: 'project-acquisition',
    titleKey: 'labHome.section.projectAcquisition.title',
    emptyKey: 'labHome.section.projectAcquisition.empty',
  },
  {
    key: 'teaching',
    id: 'teaching',
    titleKey: 'labHome.section.teaching.title',
    emptyKey: 'labHome.section.teaching.empty',
  },
  {
    key: 'labManagement',
    id: 'lab-management',
    titleKey: 'labHome.section.labManagement.title',
    emptyKey: 'labHome.section.labManagement.empty',
  },
] as const

type LabHomeSection = typeof LAB_HOME_SECTIONS[number]

interface LabHomeViewProps {
  locale?: AppLocale
  rootPath?: string
  entries?: VaultEntry[]
  folders?: FolderNode[]
  researchLabMode?: ResearchLabModeConfig | null
  onOpenFolder?: (path: string) => void
  onCreateFolder?: (path: string) => Promise<boolean> | boolean
}

function sectionFolderPath(section: LabHomeSection, researchLabMode?: ResearchLabModeConfig | null): string {
  return researchLabMode?.folders[section.key] ?? ''
}

function sectionEntries(
  entries: VaultEntry[],
  folderPath: string,
  rootPath?: string,
): VaultEntry[] {
  if (!folderPath) return []
  return filterEntries(entries, { kind: 'folder', path: folderPath, rootPath })
}

function LabHomeSectionBody({
  existingFolderPaths,
  entries,
  locale,
  onCreateFolder,
  onOpenFolder,
  researchLabMode,
  rootPath,
  section,
}: {
  existingFolderPaths: string[]
  entries: VaultEntry[]
  locale: AppLocale
  onCreateFolder?: (path: string) => Promise<boolean> | boolean
  onOpenFolder?: (path: string) => void
  researchLabMode?: ResearchLabModeConfig | null
  rootPath?: string
  section: LabHomeSection
}) {
  if (researchLabMode?.enabled !== true) {
    return <p className="text-sm leading-6 text-muted-foreground">{translate(locale, section.emptyKey)}</p>
  }

  const folderPath = sectionFolderPath(section, researchLabMode)
  const folderExists = researchLabFolderExists(folderPath, existingFolderPaths)
  const visibleEntries = folderExists ? sectionEntries(entries, folderPath, rootPath) : []
  const previewEntries = visibleEntries.slice(0, 4)

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
        {folderPath}
      </div>
      {!folderExists ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">{translate(locale, 'labHome.status.folderMissing')}</p>
          <div>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              data-testid={`lab-home-create-folder-${section.key}`}
              onClick={() => { void onCreateFolder?.(folderPath) }}
            >
              {translate(locale, 'sidebar.action.createFolder')}
            </Button>
          </div>
        </>
      ) : previewEntries.length > 0 ? (
        <>
          <div className="space-y-2">
            {previewEntries.map((entry) => (
              <div key={entry.path} className="truncate text-sm text-foreground">{entry.title}</div>
            ))}
          </div>
          <div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              data-testid={`lab-home-open-folder-${section.key}`}
              onClick={() => onOpenFolder?.(folderPath)}
            >
              {translate(locale, 'labHome.action.openFolder')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm leading-6 text-muted-foreground">{translate(locale, section.emptyKey)}</p>
          <div>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              data-testid={`lab-home-open-folder-${section.key}`}
              onClick={() => onOpenFolder?.(folderPath)}
            >
              {translate(locale, 'labHome.action.openFolder')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function LabHomeView({
  locale = 'en',
  rootPath,
  entries = [],
  folders = [],
  researchLabMode = null,
  onOpenFolder,
  onCreateFolder,
}: LabHomeViewProps) {
  const existingFolderPaths = flattenResearchLabFolderPaths(folders)

  return (
    <div data-testid="lab-home-view" className="h-full overflow-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-foreground">{translate(locale, 'sidebar.nav.labHome')}</h1>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {LAB_HOME_SECTIONS.map((section) => (
            <Card key={section.id} data-testid={`lab-home-section-${section.id}`} className="min-h-[188px] border-border/80 py-0">
              <CardHeader className="border-b border-border/70 py-5">
                <h2 className="text-base font-semibold text-foreground">{translate(locale, section.titleKey)}</h2>
              </CardHeader>
              <CardContent className="flex flex-1 items-center py-5">
                <LabHomeSectionBody
                  existingFolderPaths={existingFolderPaths}
                  entries={entries}
                  locale={locale}
                  onCreateFolder={onCreateFolder}
                  onOpenFolder={onOpenFolder}
                  researchLabMode={researchLabMode}
                  rootPath={rootPath}
                  section={section}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LabHomeViewLoading() {
  return (
    <div data-testid="note-list-loading-skeleton" className="h-full overflow-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-6xl animate-pulse flex-col gap-4">
        <div className="h-8 w-32 rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="min-h-[188px] rounded-xl border border-border bg-background/70 p-6">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="mt-6 h-4 w-56 rounded bg-muted" />
              <div className="mt-2 h-4 w-44 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}