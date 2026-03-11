import {describe, expect, test, vi} from 'vitest'

const mockProcessTemplate = vi.hoisted(() => vi.fn().mockReturnValue('// generated config'))

vi.mock('../processTemplate.js', () => ({
  processTemplate: mockProcessTemplate,
}))

const {createAppCliConfig} = await import('../createAppCliConfig.js')

describe('createAppCliConfig', () => {
  test('passes default app resources to the template processor', () => {
    const result = createAppCliConfig({
      dataset: 'production',
      entry: './src/App.tsx',
      organizationId: 'org-123',
      projectId: 'project-123',
    })

    expect(result).toBe('// generated config')
    expect(mockProcessTemplate).toHaveBeenCalledWith({
      template: expect.stringContaining(`resources: {`),
      variables: {
        dataset: 'production',
        entry: './src/App.tsx',
        organizationId: 'org-123',
        projectId: 'project-123',
      },
    })
  })
})
