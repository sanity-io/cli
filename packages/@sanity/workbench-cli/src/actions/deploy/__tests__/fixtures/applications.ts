import {type Application} from '../../../../services/applications.js'

export function toApplication(overrides: Partial<Application> = {}): Application {
  const application = {
    createdAt: '2026-01-01T00:00:00.000Z',
    externalUrl: null,
    icon: null,
    id: 'app-1',
    isSingleton: false,
    name: 'drop-desk',
    organizationId: 'org-1',
    slug: 'app',
    title: 'My App',
    type: 'coreApp' as const,
    updatedAt: '2026-01-01T00:00:00.000Z',
    visibility: 'default' as const,
    ...overrides,
  }

  return {
    ...application,
    reference: overrides.reference ?? `${application.organizationId}/${application.name}`,
  }
}
