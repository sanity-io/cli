/**
 * GENERATED FILE - DO NOT EDIT
 *
 * Routing manifest for `sanity api`, distilled from the published OpenAPI
 * specifications at https://www.sanity.io/docs/api/openapi
 *
 * Regenerate with: pnpm generate:api-routes
 */
import {type ApiRouteEntry} from '../actions/api/types.js'

export const apiRoutes: ApiRouteEntry[] = [
  {
    defaultApiVersion: 'v2025-07-11',
    host: 'global',
    pathPatterns: [
      'access/invites/me',
      'access/organization/{resourceId}/users/roles/default',
      'access/requests/me',
      'access/robots/me',
      'access/robots/me/rotate',
      'access/{resourceType}/{resourceId}/invites',
      'access/{resourceType}/{resourceId}/invites/token/{inviteToken}',
      'access/{resourceType}/{resourceId}/invites/token/{inviteToken}/accept',
      'access/{resourceType}/{resourceId}/invites/{inviteId}',
      'access/{resourceType}/{resourceId}/permissions',
      'access/{resourceType}/{resourceId}/permissions/{permissionName}',
      'access/{resourceType}/{resourceId}/requests',
      'access/{resourceType}/{resourceId}/requests/{requestId}/accept',
      'access/{resourceType}/{resourceId}/requests/{requestId}/decline',
      'access/{resourceType}/{resourceId}/robots',
      'access/{resourceType}/{resourceId}/robots/{robotId}',
      'access/{resourceType}/{resourceId}/roles',
      'access/{resourceType}/{resourceId}/roles/{roleName}',
      'access/{resourceType}/{resourceId}/user-permissions/me',
      'access/{resourceType}/{resourceId}/user-permissions/me/check',
      'access/{resourceType}/{resourceId}/users',
      'access/{resourceType}/{resourceId}/users/me',
      'access/{resourceType}/{resourceId}/users/{sanityUserId}',
      'access/{resourceType}/{resourceId}/users/{sanityUserId}/roles',
      'access/{resourceType}/{resourceId}/users/{sanityUserId}/roles/{roleName}'
    ],
    slug: 'access-api',
    title: 'Access API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/actions/{dataset}'
    ],
    slug: 'actions',
    title: 'Actions API reference'
  },
  {
    defaultApiVersion: 'v2021-02-01',
    host: 'global',
    pathPatterns: [
      'activity',
      'activity/export/csv'
    ],
    slug: 'activity-log',
    title: 'Activity Log API Reference'
  },
  {
    defaultApiVersion: 'vX',
    host: 'project',
    pathPatterns: [
      'agent/action/generate/{dataset}',
      'agent/action/patch/{dataset}',
      'agent/action/prompt/{dataset}',
      'agent/action/transform/{dataset}',
      'agent/action/translate/{dataset}'
    ],
    slug: 'agent-actions',
    title: 'Agent Actions'
  },
  {
    host: 'global',
    pathPatterns: [
      'applications',
      'applications/{applicationId}',
      'applications/{applicationId}/access',
      'applications/{applicationId}/deployments',
      'applications/{applicationId}/installations',
      'applications/{applicationId}/interfaces',
      'applications/{applicationId}/workspaces',
      'deploy',
      'deploy/quickstart',
      'installations',
      'installations/{installationId}',
      'installations/{installationId}/access',
      'installations/{installationId}/configs',
      'installations/{installationId}/configs/{configId}',
      'installations/{installationId}/interfaces',
      'projects/{projectId}/user-applications',
      'projects/{projectId}/user-applications/{userApplicationId}',
      'projects/{projectId}/user-applications/{userApplicationId}/config/{configKey}',
      'projects/{projectId}/user-applications/{userApplicationId}/deployments',
      'studiohosts/{appHost}/availability',
      'user-applications',
      'user-applications/auto-update-version/{userApplicationId}?',
      'user-applications/resolve/application',
      'user-applications/resolve/project',
      'user-applications/workspaces',
      'user-applications/{userApplicationId}',
      'user-applications/{userApplicationId}/applicationData',
      'user-applications/{userApplicationId}/config/{configKey}',
      'user-applications/{userApplicationId}/deployments',
      'user-applications/{userApplicationId}/workspaces'
    ],
    slug: 'applications-api',
    title: 'Applications API Reference'
  },
  {
    host: 'project',
    pathPatterns: [
      'applications',
      'applications/{applicationId}',
      'applications/{applicationId}/access',
      'applications/{applicationId}/deployments',
      'applications/{applicationId}/installations',
      'applications/{applicationId}/interfaces',
      'applications/{applicationId}/workspaces',
      'deploy',
      'deploy/quickstart',
      'installations',
      'installations/{installationId}',
      'installations/{installationId}/access',
      'installations/{installationId}/configs',
      'installations/{installationId}/configs/{configId}',
      'installations/{installationId}/interfaces',
      'projects/{projectId}/user-applications',
      'projects/{projectId}/user-applications/{userApplicationId}',
      'projects/{projectId}/user-applications/{userApplicationId}/config/{configKey}',
      'projects/{projectId}/user-applications/{userApplicationId}/deployments',
      'studiohosts/{appHost}/availability',
      'user-applications',
      'user-applications/auto-update-version/{userApplicationId}?',
      'user-applications/resolve/application',
      'user-applications/resolve/project',
      'user-applications/workspaces',
      'user-applications/{userApplicationId}',
      'user-applications/{userApplicationId}/applicationData',
      'user-applications/{userApplicationId}/config/{configKey}',
      'user-applications/{userApplicationId}/deployments',
      'user-applications/{userApplicationId}/workspaces'
    ],
    slug: 'applications-api',
    title: 'Applications API Reference'
  },
  {
    defaultApiVersion: 'v2024-06-24',
    host: 'project',
    pathPatterns: [
      'assets/files/{dataset}',
      'assets/images/{dataset}',
      'assets/media-library-link/{dataset}'
    ],
    slug: 'assets',
    title: 'Assets API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'global',
    pathPatterns: [
      'projects/{projectId}/datasets/{datasetName}/backups',
      'projects/{projectId}/datasets/{datasetName}/backups/{backupId}',
      'projects/{projectId}/datasets/{datasetName}/settings/backups'
    ],
    slug: 'backups',
    title: 'Backups API reference'
  },
  {
    defaultApiVersion: 'vX',
    host: 'global',
    pathPatterns: [
      'agent/prompt',
      'agent/{organizationId}/threads/{threadId}'
    ],
    slug: 'content-agent',
    title: 'Content Agent API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'global',
    pathPatterns: [
      'projects/{projectId}/datasets/{dataset}/copy'
    ],
    slug: 'copy',
    title: 'Copy API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/doc/{dataset}/{documentId}'
    ],
    slug: 'doc',
    title: 'Doc API reference'
  },
  {
    defaultApiVersion: 'vX',
    host: 'project',
    pathPatterns: [
      'embeddings-index/query/{dataset}/{indexName}',
      'embeddings-index/{dataset}',
      'embeddings-index/{dataset}/{indexName}'
    ],
    slug: 'embeddings-index',
    title: 'Embeddings Index API reference'
  },
  {
    defaultApiVersion: 'v2021-03-25',
    host: 'project',
    pathPatterns: [
      'data/export/{dataset}'
    ],
    slug: 'export',
    title: 'Export API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/history/{dataset}/documents/{documentId}',
      'data/history/{dataset}/transactions',
      'data/history/{dataset}/transactions/{documentIds}'
    ],
    slug: 'history',
    title: 'History API reference'
  },
  {
    defaultApiVersion: 'v2021-06-07',
    host: 'global',
    pathPatterns: [
      'jobs/{jobId}',
      'jobs/{jobId}/listen'
    ],
    slug: 'jobs',
    title: 'Jobs API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/listen/{dataset}'
    ],
    slug: 'listen',
    title: 'Listen API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/live/events/{dataset}'
    ],
    slug: 'live',
    title: 'Live Content API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'global',
    pathPatterns: [
      'media-libraries/{libraryId}/mutate',
      'media-libraries/{libraryId}/query',
      'media-libraries/{libraryId}/references/documents/{assetId}/to',
      'media-libraries/{libraryId}/refsearch',
      'media-libraries/{libraryId}/signing-keys',
      'media-libraries/{libraryId}/signing-keys/{keyId}',
      'media-libraries/{libraryId}/upload',
      'media-libraries/{libraryId}/video/{videoId}/playback-info',
      'media-libraries/{libraryId}/video/{videoId}/playback/{type}',
      'media-libraries/{libraryId}/video/{videoId}/renditions/{name}',
      'media-libraries/{libraryId}/video/{videoId}/subtitles',
      'media-libraries/{libraryId}/video/{videoId}/subtitles/upload',
      'media-libraries/{libraryId}/video/{videoId}/subtitles/{subtitleId}'
    ],
    slug: 'media-library',
    title: 'Media Library API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'media-libraries/{libraryId}/mutate',
      'media-libraries/{libraryId}/query',
      'media-libraries/{libraryId}/references/documents/{assetId}/to',
      'media-libraries/{libraryId}/refsearch',
      'media-libraries/{libraryId}/signing-keys',
      'media-libraries/{libraryId}/signing-keys/{keyId}',
      'media-libraries/{libraryId}/upload',
      'media-libraries/{libraryId}/video/{videoId}/playback-info',
      'media-libraries/{libraryId}/video/{videoId}/playback/{type}',
      'media-libraries/{libraryId}/video/{videoId}/renditions/{name}',
      'media-libraries/{libraryId}/video/{videoId}/subtitles',
      'media-libraries/{libraryId}/video/{videoId}/subtitles/upload',
      'media-libraries/{libraryId}/video/{videoId}/subtitles/{subtitleId}'
    ],
    slug: 'media-library',
    title: 'Media Library API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/mutate/{dataset}'
    ],
    slug: 'mutation',
    title: 'Mutation API reference'
  },
  {
    defaultApiVersion: 'v2021-06-07',
    host: 'global',
    pathPatterns: [
      'projects',
      'projects/{projectId}',
      'projects/{projectId}/cors',
      'projects/{projectId}/cors/{id}',
      'projects/{projectId}/datasets',
      'projects/{projectId}/datasets/{datasetName}/tags/{tagIdentifier}',
      'projects/{projectId}/datasets/{name}',
      'projects/{projectId}/datasets/{name}/copy',
      'projects/{projectId}/datasets/{name}/settings/embeddings',
      'projects/{projectId}/datasets/{name}/tags',
      'projects/{projectId}/features',
      'projects/{projectId}/permissions',
      'projects/{projectId}/tags',
      'projects/{projectId}/tags/{tagIdentifier}',
      'projects/{projectId}/tokens',
      'projects/{projectId}/tokens/{tokenId}',
      'projects/{projectId}/users/{userId}'
    ],
    slug: 'projects-api',
    title: 'Projects API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'data/query/{dataset}'
    ],
    slug: 'query',
    title: 'Query API reference'
  },
  {
    defaultApiVersion: 'v2021-10-04',
    host: 'global',
    pathPatterns: [
      'organizations/{organizationId}/acl',
      'organizations/{organizationId}/acl/{sanityUserId}',
      'organizations/{organizationId}/grants',
      'organizations/{organizationId}/providers/{providerId}/projects/{projectId}/role-mappings',
      'projects/{projectId}/acl',
      'projects/{projectId}/acl/{userId}',
      'projects/{projectId}/datasets/{datasetName}/acl',
      'projects/{projectId}/datasets/{datasetName}/grants',
      'projects/{projectId}/grants',
      'projects/{projectId}/permissionResourceSchemas',
      'projects/{projectId}/roles',
      'projects/{projectId}/roles/{roleName}'
    ],
    slug: 'roles',
    title: 'Roles API reference'
  },
  {
    defaultApiVersion: 'v2022-04-01',
    host: 'project',
    pathPatterns: [
      'publish/{projectId}/{dataset}',
      'schedules/{projectId}/{dataset}',
      'schedules/{projectId}/{dataset}/{scheduleId}',
      'schedules/{projectId}/{dataset}/{scheduleId}/publish',
      'unpublish/{projectId}/{dataset}'
    ],
    slug: 'scheduling',
    title: 'Scheduling API reference'
  },
  {
    defaultApiVersion: 'v2026-04-27',
    host: 'global',
    pathPatterns: [
      'organizations/{organizationId}/attribute-definitions',
      'organizations/{organizationId}/attribute-definitions/{key}',
      'organizations/{organizationId}/users/me/attributes',
      'organizations/{organizationId}/users/{sanityUserId}/attributes'
    ],
    slug: 'user-attributes',
    title: 'User attributes API reference'
  },
  {
    defaultApiVersion: 'v2025-02-19',
    host: 'project',
    pathPatterns: [
      'hooks/projects/{projectId}',
      'hooks/projects/{projectId}/{id}',
      'hooks/projects/{projectId}/{id}/attempts',
      'hooks/{id}/messages'
    ],
    slug: 'webhooks',
    title: 'Webhooks API reference'
  }
]
