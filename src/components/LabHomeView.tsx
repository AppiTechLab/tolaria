import type { AppLocale } from '../lib/i18n'
import { translate } from '../lib/i18n'
import { Card, CardContent, CardHeader } from './ui/card'

const LAB_HOME_SECTIONS = [
  {
    id: 'ongoing-projects',
    titleKey: 'labHome.section.ongoingProjects.title',
    emptyKey: 'labHome.section.ongoingProjects.empty',
  },
  {
    id: 'project-acquisition',
    titleKey: 'labHome.section.projectAcquisition.title',
    emptyKey: 'labHome.section.projectAcquisition.empty',
  },
  {
    id: 'teaching',
    titleKey: 'labHome.section.teaching.title',
    emptyKey: 'labHome.section.teaching.empty',
  },
  {
    id: 'lab-management',
    titleKey: 'labHome.section.labManagement.title',
    emptyKey: 'labHome.section.labManagement.empty',
  },
] as const

export function LabHomeView({ locale = 'en' }: { locale?: AppLocale }) {
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
                <p className="text-sm leading-6 text-muted-foreground">{translate(locale, section.emptyKey)}</p>
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