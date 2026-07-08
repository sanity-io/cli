// The deploy-check vocabulary shared by every deploy adapter: a check never
// prints or exits itself — a dry-run plan collects checks into a report, a
// real deploy passes each through `enforce`. One producer backs both modes so
// messages can't drift.

import {exitCodes} from '../exitCodes.js'
import {type Output} from '../types.js'
import {getSanityUrl} from '../util/getSanityUrl.js'

export interface DeployCheck {
  message: string
  status: 'fail' | 'pass' | 'skip' | 'warn'

  /** Exit code a real deploy uses when this check fails; defaults to 1 */
  exitCode?: number
  /** Actionable fix, shown under a failing or warning check */
  solution?: string
}

/** Where a deploy resolves to; the dry-run report and `--json` both read it. */
export interface DeployTarget {
  /** The application the deploy targets; `null` when a deploy would create one. */
  applicationId: string | null
  /** The application's title; `null` when it has none (or isn't created yet). */
  title: string | null
  /** Where the deployed studio/app is reachable; `null` when it can't be resolved yet. */
  url: string | null
}

export interface TargetCheck {
  check: DeployCheck
  target: DeployTarget | null
}

/** A `fail` prints and exits (the thrown exit aborts the deploy), a `warn` prints, the rest is silent. */
export function enforce(output: Output, check: DeployCheck): void {
  const text = check.solution ? `${check.message}: ${check.solution}` : check.message
  if (check.status === 'fail') {
    output.error(text, {exit: check.exitCode ?? 1})
  } else if (check.status === 'warn') {
    output.warn(text)
  }
}

export const NO_PROJECT_ID = `sanity.cli.ts does not contain a project identifier ("api.projectId"), which is required for the Sanity CLI to communicate with the Sanity API`
export const NO_ORGANIZATION_ID = `sanity.cli.ts does not contain an organization identifier ("app.organizationId"), which is required for the Sanity CLI to communicate with the Sanity API`
export const APP_ID_NOT_FOUND_IN_ORGANIZATION = `The \`appId\` provided in your configuration’s \`deployment\` object cannot be found in your organization`

export function getCoreAppUrl(organizationId: string, appId: string): string {
  return getSanityUrl(`/@${organizationId}/application/${appId}`)
}

export function checkProjectId(projectId: string | undefined): DeployCheck {
  return projectId
    ? {message: `Project: ${projectId}`, status: 'pass'}
    : {message: NO_PROJECT_ID, solution: 'Add `api.projectId` to sanity.cli.ts', status: 'fail'}
}

export function checkOrganizationId(organizationId: string | undefined): DeployCheck {
  return organizationId
    ? {message: `Organization: ${organizationId}`, status: 'pass'}
    : {
        message: NO_ORGANIZATION_ID,
        solution: 'Add `app.organizationId` to sanity.cli.ts',
        status: 'fail',
      }
}

/** The application fields a deploy-target verdict carries for reporting. */
export interface DeployTargetApp {
  appHost: string
  id: string
  title: string | null
}

/** A coreApp verdict also carries the organization, for the dashboard URL. */
export interface DeployTargetCoreApp extends DeployTargetApp {
  organizationId: string
}

/**
 * The read-only outcome of resolving where a deploy would go.
 *
 * - `found` — the deploy targets this existing application
 * - `would-create` — nothing registered yet; a deploy would create it without prompting
 * - `needs-input` — config doesn't determine a target; a deploy would prompt
 *   (`existing` lists the applications a prompt would offer)
 * - `invalid` — the configured target can never resolve (bad host, unknown appId)
 * - `blocked` — resolution requires config that's missing (projectId/organizationId)
 *
 * Transport errors (network, permissions) throw — they're not verdicts.
 */
export type CommonDeployTargetResolution<App = DeployTargetApp> =
  | {application: App; type: 'found'}
  | {existing: App[]; type: 'needs-input'}
  | {message: string; reason: 'app-not-found' | 'invalid-host'; type: 'invalid'}
  | {message: string; type: 'blocked'}

export type StudioDeployTargetResolution<App = DeployTargetApp> =
  | CommonDeployTargetResolution<App>
  | {appHost: string; type: 'would-create'}

export type AppDeployTargetResolution<App = DeployTargetCoreApp> =
  | CommonDeployTargetResolution<App>
  | {type: 'would-create'}

/**
 * The single diagnosis for each app deploy-target verdict, shared by the
 * dry-run report and the real deploy's unattended error paths.
 */
export function describeAppTarget(
  resolution: AppDeployTargetResolution,
  {title}: {title?: string} = {},
): TargetCheck {
  switch (resolution.type) {
    case 'blocked': {
      return {
        check: {message: `Deploy target not resolved — ${resolution.message}`, status: 'skip'},
        target: null,
      }
    }
    case 'found': {
      const {application} = resolution
      const name = application.title ?? application.appHost
      const url = getCoreAppUrl(application.organizationId, application.id)
      return {
        check: {message: `Deploys to existing application "${name}" at ${url}`, status: 'pass'},
        target: {applicationId: application.id, title: application.title ?? null, url},
      }
    }
    case 'invalid': {
      return {
        check: {
          message: APP_ID_NOT_FOUND_IN_ORGANIZATION,
          solution: 'Check `deployment.appId` matches an app in your organization',
          status: 'fail',
        },
        target: null,
      }
    }
    case 'needs-input': {
      return {
        check: {
          exitCode: exitCodes.USAGE_ERROR,
          message: `No \`deployment.appId\` configured (${resolution.existing.length} existing ${resolution.existing.length === 1 ? 'application' : 'applications'} to choose from)`,
          solution: 'Add `deployment.appId` to sanity.cli.ts',
          status: 'fail',
        },
        target: null,
      }
    }
    // Without --title, creating an app needs a prompt no unattended run can answer
    case 'would-create': {
      if (title) {
        return {
          check: {message: `Would create a new application "${title}"`, status: 'pass'},
          target: {applicationId: null, title, url: null},
        }
      }
      return {
        check: {
          exitCode: exitCodes.USAGE_ERROR,
          message: 'No application to deploy to — creating one needs a title',
          solution:
            'Pass `--title "<name>"` or set `app.title` in sanity.cli.ts to create one, or set `deployment.appId` to deploy to an existing app',
          status: 'fail',
        },
        target: null,
      }
    }
  }
}

/** Same contract as {@link describeAppTarget}, for the studio verdicts. */
export function describeStudioTarget(
  resolution: StudioDeployTargetResolution,
  {isExternal, title}: {isExternal: boolean; title?: string},
): TargetCheck {
  const studioUrl = (host: string) => (isExternal ? host : `https://${host}.sanity.studio`)

  switch (resolution.type) {
    case 'blocked': {
      return {
        check: {message: `Deploy target not resolved — ${resolution.message}`, status: 'skip'},
        target: null,
      }
    }
    case 'found': {
      const url = studioUrl(resolution.application.appHost)
      return {
        check: {message: `Deploys to existing studio ${url}`, status: 'pass'},
        target: {
          applicationId: resolution.application.id,
          title: resolution.application.title ?? null,
          url,
        },
      }
    }
    case 'invalid': {
      return {
        check: {
          // A bad host is a usage error; other invalid targets exit 1
          exitCode: resolution.reason === 'invalid-host' ? exitCodes.USAGE_ERROR : 1,
          message: resolution.message,
          solution: 'Check `studioHost` and `deployment.appId` in sanity.cli.ts',
          status: 'fail',
        },
        target: null,
      }
    }
    case 'needs-input': {
      return {
        check: {
          exitCode: exitCodes.USAGE_ERROR,
          message: isExternal
            ? 'No external studio URL configured'
            : 'No studio hostname configured',
          solution: isExternal
            ? 'Set `studioHost` in sanity.cli.ts, or pass the full URL with --url'
            : 'Set `studioHost` in sanity.cli.ts, or pass a hostname with --url',
          status: 'fail',
        },
        target: null,
      }
    }
    case 'would-create': {
      const url = studioUrl(resolution.appHost)
      const titled = title ? ` titled "${title}"` : ''
      return {
        check: {
          message: isExternal
            ? `Would register external studio at ${resolution.appHost}${titled}`
            : `Would create studio hostname ${url}${titled} (name availability is checked on deploy)`,
          status: 'pass',
        },
        // `title || null`, not `?? null`, so target.title tracks the same
        // truthiness the message's `titled` suffix uses (an empty title is no title)
        target: {applicationId: null, title: title || null, url},
      }
    }
  }
}
