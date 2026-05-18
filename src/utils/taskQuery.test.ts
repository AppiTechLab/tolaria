import { describe, expect, it } from 'vitest'
import {
  executeTaskQuery,
  extractTasksFromNoteContent,
  parseTaskQuery,
  toggleTaskCheckedInContent,
} from './taskQuery'

describe('taskQuery', () => {
  it('extracts checklist tasks while skipping frontmatter and fenced code blocks', () => {
    const tasks = extractTasksFromNoteContent(
      '/vault/project/alpha.md',
      [
        '---',
        'title: Alpha',
        '---',
        '# Alpha',
        '',
        '- [ ] Write spec 🔺 📅 2026-05-14',
        '```tasks',
        '- [ ] Ignore me',
        '```',
        '- [x] Ship it ✅ 2026-05-15',
      ].join('\n'),
    )

    expect(tasks).toEqual([
      expect.objectContaining({
        path: '/vault/project/alpha.md',
        lineNumber: 6,
        checked: false,
        description: 'Write spec',
        priority: 'highest',
        prioritySymbol: '🔺',
        dueDate: '2026-05-14',
      }),
      expect.objectContaining({
        path: '/vault/project/alpha.md',
        lineNumber: 10,
        checked: true,
        description: 'Ship it',
        priority: 'none',
        prioritySymbol: null,
        doneDate: '2026-05-15',
      }),
    ])
  })

  it('parses the supported query directives', () => {
    const query = parseTaskQuery([
      'not done',
      'path includes project',
      'description includes spec',
      'Tags include #PM/filiere/spring2026',
      'due before tomorrow',
      'priority is high',
      'sort by priority',
      'group by filename',
      'limit 5',
      'explain',
      'status type is cancelled',
    ].join('\n'), new Date('2026-05-14T12:00:00Z'))

    expect(query).toEqual(expect.objectContaining({
      status: 'not_done',
      pathIncludes: ['project'],
      descriptionIncludes: ['spec'],
      tagIncludes: ['pm/filiere/spring2026'],
      limit: 5,
      groupBy: 'filename',
      explain: true,
      unsupported: ['status type is cancelled'],
      priorityFilters: [{ operator: 'is', priority: 'high' }],
      sorts: [{ field: 'priority', direction: 'asc' }],
    }))
    expect(query.dueComparisons).toHaveLength(1)
    expect(query.dueComparisons[0]).toEqual(expect.objectContaining({ operator: 'before', source: 'tomorrow' }))
  })

  it('filters, sorts, groups, and limits query results', () => {
    const result = executeTaskQuery({
      queryText: [
        'not done',
        'path includes project',
        'due before tomorrow',
        'sort by due reverse',
        'group by filename',
        'limit 1',
      ].join('\n'),
      referenceDate: new Date('2026-05-14T08:00:00Z'),
      contentByPath: {
        '/vault/project/alpha.md': '# Alpha\n\n- [ ] Write spec 📅 2026-05-13\n- [ ] Later task 📅 2026-05-18\n',
        '/vault/project/beta.md': '# Beta\n\n- [ ] Review draft 📅 2026-05-14\n',
        '/vault/home.md': '# Home\n\n- [ ] Personal reminder 📅 2026-05-14\n',
      },
    })

    expect(result.tasks.map((task) => `${task.path}:${task.description}`)).toEqual([
      '/vault/project/beta.md:Review draft',
    ])
    expect(result.groups).toEqual([
      {
        key: 'beta.md',
        tasks: [expect.objectContaining({ description: 'Review draft' })],
      },
    ])
  })

  it('filters tasks by note tags without leaking task tags to siblings', () => {
    const result = executeTaskQuery({
      queryText: [
        'not done',
        'tags include #PM/project/Auto-Anno',
        'sort by path',
      ].join('\n'),
      contentByPath: {
        '/vault/project/alpha.md': [
          '---',
          'Tags:',
          '  - PM/project/Auto-Anno',
          '---',
          '# Alpha',
          '',
          '- [ ] Frontmatter task',
        ].join('\n'),
        '/vault/project/beta.md': [
          '# Beta',
          '',
          '- [ ] Inline tag task #PM/project/Auto-Anno',
          '- [ ] Untagged sibling task',
        ].join('\n'),
        '/vault/project/gamma.md': [
          '# Gamma',
          '',
          '- [ ] Different tag task #PM/project/Elsewhere',
        ].join('\n'),
      },
    })

    expect(result.tasks.map((task) => `${task.path}:${task.description}`)).toEqual([
      '/vault/project/alpha.md:Frontmatter task',
      '/vault/project/beta.md:Inline tag task #PM/project/Auto-Anno',
    ])
  })

  it('matches tag prefixes and combines repeated tag filters with AND', () => {
    const result = executeTaskQuery({
      queryText: [
        'not done',
        'tags include #PM/assign/widmera',
        'tags include #PM/project/',
        'sort by path',
      ].join('\n'),
      contentByPath: {
        '/vault/project/alpha.md': [
          '# Alpha',
          '',
          '- [ ] Matching task #PM/assign/widmera #PM/project/Auto-Anno',
          '- [ ] Missing project tag #PM/assign/widmera',
        ].join('\n'),
        '/vault/project/beta.md': [
          '# Beta',
          '',
          '- [ ] Missing assign tag #PM/project/Elsewhere',
        ].join('\n'),
      },
    })

    expect(result.tasks.map((task) => `${task.path}:${task.description}`)).toEqual([
      '/vault/project/alpha.md:Matching task #PM/assign/widmera #PM/project/Auto-Anno',
    ])
  })

  it('groups tasks with the supported task.tags prefix function syntax', () => {
    const result = executeTaskQuery({
      queryText: [
        'not done',
        'tags include #PM/assign/widmera',
        'tags include #PM/sub/',
        'group by function task.tags.filter(t => t.startsWith("#PM/sub/")).join(", ")',
        'sort by path',
      ].join('\n'),
      contentByPath: {
        '/vault/project/alpha.md': [
          '# Alpha',
          '',
          '- [ ] Teaching follow-up #PM/assign/widmera #PM/sub/Teaching',
          '- [ ] Outreach follow-up #PM/assign/widmera #PM/sub/Outreach',
        ].join('\n'),
        '/vault/project/beta.md': [
          '# Beta',
          '',
          '- [ ] Dual-tag follow-up #PM/assign/widmera #PM/sub/Outreach #PM/sub/Teaching',
        ].join('\n'),
      },
    })

    expect(result.groups).toEqual([
      {
        key: '#pm/sub/teaching',
        tasks: [expect.objectContaining({ description: 'Teaching follow-up #PM/assign/widmera #PM/sub/Teaching' })],
      },
      {
        key: '#pm/sub/outreach',
        tasks: [expect.objectContaining({ description: 'Outreach follow-up #PM/assign/widmera #PM/sub/Outreach' })],
      },
      {
        key: '#pm/sub/outreach, #pm/sub/teaching',
        tasks: [expect.objectContaining({ description: 'Dual-tag follow-up #PM/assign/widmera #PM/sub/Outreach #PM/sub/Teaching' })],
      },
    ])
  })

  it('supports priority filters and sorts higher priorities first', () => {
    const result = executeTaskQuery({
      queryText: [
        'not done',
        'priority is above none',
        'sort by priority',
      ].join('\n'),
      contentByPath: {
        '/vault/project/alpha.md': '# Alpha\n\n- [ ] Highest first 🔺\n- [ ] Medium next 🔼\n- [ ] Plain task\n',
        '/vault/project/beta.md': '# Beta\n\n- [ ] High second ⏫\n- [ ] Lowest last ⏬\n',
      },
    })

    expect(result.tasks.map((task) => `${task.priority}:${task.description}`)).toEqual([
      'highest:Highest first',
      'high:High second',
      'medium:Medium next',
    ])
  })

  it('filters by scheduled and done dates with inclusive operators', () => {
    const scheduledResult = executeTaskQuery({
      queryText: [
        'has scheduled date',
        'scheduled on or after 2026-05-15',
      ].join('\n'),
      contentByPath: {
        '/vault/project/alpha.md': '# Alpha\n\n- [ ] Ship beta ⏳ 2026-05-15\n- [ ] Later work ⏳ 2026-05-20\n- [ ] No schedule\n',
      },
    })

    expect(scheduledResult.tasks.map((task) => task.description)).toEqual([
      'Ship beta',
      'Later work',
    ])

    const doneResult = executeTaskQuery({
      queryText: [
        'done',
        'has done date',
        'done on or before 2026-05-15',
      ].join('\n'),
      contentByPath: {
        '/vault/project/beta.md': '# Beta\n\n- [x] Closed today ✅ 2026-05-15\n- [x] Closed later ✅ 2026-05-16\n- [x] Missing date\n',
      },
    })

    expect(doneResult.tasks.map((task) => task.description)).toEqual([
      'Closed today',
    ])
  })

  it('toggles a task line while preserving CRLF line endings', () => {
    const content = '---\r\ntitle: Alpha\r\n---\r\n# Alpha\r\n\r\n- [ ] Review draft\r\n'
    const toggled = toggleTaskCheckedInContent({ content, lineNumber: 6, checked: true })

    expect(toggled).toBe('---\r\ntitle: Alpha\r\n---\r\n# Alpha\r\n\r\n- [x] Review draft\r\n')
  })
})