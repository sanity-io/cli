import {styleText} from 'node:util'

import {type DashboardConfig} from '@sanity/workbench-cli'
import {
  getOrganizationDashboard,
  getWorkbenchUrl,
  summarizeConfig,
  uploadDashboardConfig,
} from '@sanity/workbench-cli/deploy'

import {buildApp} from '../build/buildApp.js'
import {checkBuild, checkPackageVersion, verifyOutputDir} from './deployChecks.js'
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
      const version = await checkPackageVersion(reporter, {moduleName: 'sanity', workDir})
      reporter.report({message: `Organization: ${organizationId}`, status: 'pass'})

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

      const dashboard = await getOrganizationDashboard(organizationId)
      const action = dashboard ? 'update' : 'create'
      const url = getWorkbenchUrl(organizationId)
      reporter.report({
        message: dashboard
          ? 'Updates the dashboard configuration'
          : 'Creates the dashboard configuration',
        status: 'pass',
        target: {action, id: null, title: null, type: 'coreApp', url},
      })
      reporter.report({message: summary, status: 'pass'})

      const payload: DeployPayload = {
        appId: null,
        config: summary,
        isAutoUpdating: false,
        organizationId,
        type: 'coreApp',
        version,
      }

      if (flags['dry-run'] || !version) return {application: null, payload}

      await uploadDashboardConfig({dashboard, organizationId, sourceDir, version})
      output.log(
        `\n🚀 ${styleText('bold', 'Success!')} Dashboard configuration deployed to ${styleText('cyan', url)}`,
      )

      return {action, application: null, payload, url}
    },
    type: 'coreApp',
  })
}
