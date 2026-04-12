import {afterEach, describe, expect, test, vi} from 'vitest'

const mockProcessTemplate = vi.hoisted(() => vi.fn().mockReturnValue('// generated config'))

vi.mock('../processTemplate.js', () => ({
  processTemplate: mockProcessTemplate,
}))

const {createAppCliConfig} = await import('../createAppCliConfig.js')

describe('createAppCliConfig', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('uses template without resources when projectId and dataset are missing', () => {
    createAppCliConfig({
      entry: './src/App.tsx',
      organizationId: 'org-123',
    })

    expect(mockProcessTemplate).toHaveBeenCalledWith({
      template: expect.not.stringContaining('resources'),
      variables: {
        entry: './src/App.tsx',
        organizationId: 'org-123',
      },
    })
  })

  test('uses template without resources when only projectId is provided', () => {
    createAppCliConfig({
      entry: './src/App.tsx',
      organizationId: 'org-123',
      projectId: 'project-123',
    })

    expect(mockProcessTemplate).toHaveBeenCalledWith({
      template: expect.not.stringContaining('resources'),
      variables: {
        entry: './src/App.tsx',
        organizationId: 'org-123',
        projectId: 'project-123',
      },
    })
  })

  test('uses template with resources when both projectId and dataset are provided', () => {
    const result = createAppCliConfig({
      dataset: 'production',
      entry: './src/App.tsx',
      organizationId: 'org-123',
      projectId: 'project-123',
    })

    expect(result).toBe('// generated config')
    expect(mockProcessTemplate).toHaveBeenCalledWith({
      template: expect.stringContaining('resources'),
      variables: {
        dataset: 'production',
        entry: './src/App.tsx',
        organizationId: 'org-123',
        projectId: 'project-123',
      },
    })
  })
})
