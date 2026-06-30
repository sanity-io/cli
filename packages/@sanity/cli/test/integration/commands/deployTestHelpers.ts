/**
 * Shared fixtures for the deploy command tests: user-application API
 * responses with sensible defaults, and the user-applications endpoints the
 * deploy flows call. Each mock helper returns the interceptor so tests chain
 * their own `.reply(...)`.
 */

import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {mockApi} from '@sanity/cli-test'

import {
  USER_APPLICATIONS_API_VERSION,
  type UserApplication,
} from '../../../src/services/userApplications.js'

export function studioApplication(overrides: Partial<UserApplication> = {}): UserApplication {
  return {
    appHost: 'test-studio',
    createdAt: '2024-01-01T00:00:00Z',
    id: 'studio-app-id',
    organizationId: null,
    projectId: 'test-project-id',
    title: null,
    type: 'studio',
    updatedAt: '2024-01-01T00:00:00Z',
    urlType: 'internal',
    ...overrides,
  }
}

export function coreApplication(overrides: Partial<UserApplication> = {}): UserApplication {
  return {
    appHost: 'app-host',
    createdAt: '2024-01-01T00:00:00Z',
    id: 'app-id',
    organizationId: 'org-id',
    projectId: null,
    title: null,
    type: 'coreApp',
    updatedAt: '2024-01-01T00:00:00Z',
    urlType: 'internal',
    ...overrides,
  }
}

/** GET a studio application by host */
export function mockGetStudioAppByHost({appHost, projectId}: {appHost: string; projectId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    query: {appHost, appType: 'studio'},
    uri: `/projects/${projectId}/user-applications`,
  })
}

/** GET a studio application by id */
export function mockGetStudioAppById({appId, projectId}: {appId: string; projectId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    uri: `/projects/${projectId}/user-applications/${appId}`,
  })
}

/** GET all studio applications of a project */
export function mockListStudioApps({projectId}: {projectId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    query: {appType: 'studio'},
    uri: `/projects/${projectId}/user-applications`,
  })
}

/** POST a new studio application */
export function mockCreateStudioApp({projectId}: {projectId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    method: 'post',
    query: {appType: 'studio'},
    uri: `/projects/${projectId}/user-applications`,
  })
}

/** POST a studio deployment */
export function mockCreateStudioDeployment({
  applicationId,
  projectId,
}: {
  applicationId: string
  projectId: string
}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    method: 'post',
    query: {appType: 'studio'},
    uri: `/projects/${projectId}/user-applications/${applicationId}/deployments`,
  })
}

/** GET an app (coreApp) by id */
export function mockGetCoreApp({appId}: {appId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    query: {appType: 'coreApp'},
    uri: `/user-applications/${appId}`,
  })
}

/** GET all apps (coreApp) of an organization */
export function mockListCoreApps({organizationId}: {organizationId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    query: {appType: 'coreApp', organizationId},
    uri: `/user-applications`,
  })
}

/** POST a new app (coreApp) */
export function mockCreateCoreApp({organizationId}: {organizationId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    method: 'post',
    query: {appType: 'coreApp', organizationId},
    uri: `/user-applications`,
  })
}

/** PATCH an app (coreApp), e.g. the title sync */
export function mockUpdateCoreApp({appId}: {appId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    method: 'patch',
    query: {appType: 'coreApp'},
    uri: `/user-applications/${appId}`,
  })
}

/** POST an app (coreApp) deployment */
export function mockCreateCoreAppDeployment({applicationId}: {applicationId: string}) {
  return mockApi({
    apiVersion: USER_APPLICATIONS_API_VERSION,
    method: 'post',
    query: {appType: 'coreApp'},
    uri: `/user-applications/${applicationId}/deployments`,
  })
}

/** A minimal built output directory for file-listing assertions */
export async function createDistFiles(cwd: string): Promise<void> {
  await mkdir(join(cwd, 'dist', 'static'), {recursive: true})
  await writeFile(join(cwd, 'dist', 'index.html'), '<html></html>')
  await writeFile(join(cwd, 'dist', 'static', 'app.js'), 'console.log(1)')
}
