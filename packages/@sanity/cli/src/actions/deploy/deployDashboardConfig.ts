import {getErrorMessage} from '@sanity/cli-core/errors'
import {type DashboardConfig} from '@sanity/workbench-cli'
import {
  fetchDeploySummaryDetails,
  fetchOrganizationSummary,
  formatDeploySummary,
  getOrganizationDashboard,
  getWorkbenchUrl,
  summarizeConfig,
  uploadDashboardConfig,
} from '@sanity/workbench-cli/deploy'

import {runStep} from '../../util/checks.js'
import {EXTERNAL_APP_NOT_SUPPORTED} from '../../util/errorMessages.js'
import {buildApp} from '../build/buildApp.js'
import {checkBuild, checkPackageVersion, verifyOutputDir} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {listDeploymentFiles} from './deploymentPlan.js'
import {type DeployPayload, runDeploy} from './deployRunner.js'
import {type DeployAppOptions} from './types.js'

export function deployDashboardConfig(
  options: DeployAppOptions & {config: DashboardConfig},
): Promise<void> {
  const {organizationId} = options.config
  const summary = summarizeConfig(options.config)

  return runDeploy(options, {
    listFiles: ({projectRoot, sourceDir}) => listDeploymentFiles(sourceDir, projectRoot.directory),
    async run({cliConfig, flags, output, projectRoot, sourceDir}, reporter) {
      const workDir = projectRoot.directory
      const startedAt = Date.now()
      // The Dashboard URL is built on the org's host slug (`--json` included).
      const organization = fetchOrganizationSummary(organizationId)
      const summaryDetails = flags.json
        ? undefined
        : fetchDeploySummaryDetails(organizationId, organization)
      const version = await checkPackageVersion(reporter, {moduleName: 'sanity', workDir})
      reporter.report({message: `Organization: ${organizationId}`, status: 'pass'})

      if (flags.external) {
        reporter.report({
          message: EXTERNAL_APP_NOT_SUPPORTED,
          solution:
            'Remove the --external flag — dashboard configurations deploy to Sanity hosting',
          status: 'fail',
        })
      }

      const lookup = await runStep(reporter, {
        debug: deployDebug,
        formatError: (err) =>
          `Looking up the organization's Dashboard failed: ${getErrorMessage(err)}`,
        name: 'dashboard lookup',
        work: async () => ({dashboard: await getOrganizationDashboard(organizationId)}),
      })

      if (!lookup) return

      const {dashboard} = lookup
      const action = dashboard ? 'update' : 'create'
      const url = getWorkbenchUrl(organizationId, (await organization).hostSlug)
      reporter.report({
        message: dashboard
          ? 'Updates the dashboard configuration'
          : 'Creates the dashboard configuration',
        status: 'pass',
        target: {action, id: null, title: null, type: 'coreApp', url},
      })
      reporter.report({message: summary, status: 'pass'})

      const built = await checkBuild(reporter, {
        build: () =>
          buildApp({
            autoUpdatesEnabled: false,
            calledFromDeploy: true,
            cliConfig,
            flags,
            outDir: sourceDir,
            output,
            workDir,
          }),
        skipReason: flags.build
          ? undefined
          : 'Build skipped (--no-build) — validating existing output directory',
        successMessage: 'Dashboard configuration built',
      })

      if (!built) {
        await verifyOutputDir({isWorkbenchApp: true, reporter, sourceDir})
      }

      const payload: DeployPayload = {
        appId: null,
        config: summary,
        isAutoUpdating: false,
        organizationId,
        type: 'coreApp',
        version,
      }

      if (flags['dry-run'] || !version) return {application: null, payload}

      await uploadDashboardConfig({dashboard, organizationId, sourceDir})
      output.log(
        formatDeploySummary({
          ...(await summaryDetails),
          created: !dashboard,
          durationMs: Date.now() - startedAt,
          organizationId,
          title: 'Dashboard configuration',
          type: 'config',
          url,
        }),
      )

      return {action, application: null, payload, url}
    },
    type: 'coreApp',
  })
}
