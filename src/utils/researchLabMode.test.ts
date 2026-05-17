import { describe, expect, it } from 'vitest'
import { createDefaultResearchLabModeConfig, validateResearchLabModeConfig } from './researchLabMode'

describe('researchLabMode', () => {
  it('reports duplicate mappings as validation errors', () => {
    const config = createDefaultResearchLabModeConfig()

    config.enabled = true
    config.folders.ongoingProjects = 'Projects/Shared'
    config.folders.projectAcquisition = 'Projects/Shared'

    const result = validateResearchLabModeConfig(config, ['Projects/Shared'])

    expect(result.errors).toEqual([
      expect.objectContaining({
        field: 'projectAcquisition',
        code: 'duplicate',
        otherField: 'ongoingProjects',
      }),
    ])
  })

  it('rejects absolute paths and warns when a mapped folder does not exist yet', () => {
    const config = createDefaultResearchLabModeConfig()

    config.enabled = true
    config.folders.ongoingProjects = 'C:/Lab/Projects'
    config.folders.teaching = 'Teaching/New'

    const result = validateResearchLabModeConfig(config, ['Projects/Acquisition', 'Lab Management', 'Templates', 'views', 'AI Prompts', 'Archive'])

    expect(result.errors).toEqual([
      expect.objectContaining({
        field: 'ongoingProjects',
        code: 'absolute',
      }),
    ])
    expect(result.warnings).toContainEqual(expect.objectContaining({
      field: 'teaching',
      code: 'missing',
      path: 'Teaching/New',
    }))
  })
})