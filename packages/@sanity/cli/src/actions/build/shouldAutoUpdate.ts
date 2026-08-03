import {styleText} from 'node:util'

import {type CliConfig, type Output} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/workbench-cli'

import {type DeployFlags} from '../deploy/types.js'
import {type DevFlags} from '../dev/types.js'
import {type BuildFlags} from './types.js'

interface AutoUpdateSources {
  cliConfig: CliConfig
  flags: BuildFlags | DeployFlags | DevFlags
}

/**
 * The single auto-update configuration problem to surface, if any.
 * Flag usage takes precedence over config problems: when the deprecated flag
 * is passed, config is not consulted, so config issues are not reported.
 */
type AutoUpdateIssue =
  | {flag: '--auto-updates' | '--no-auto-updates'; type: 'deprecated-flag'}
  | {type: 'conflicting-config'}
  | {type: 'deprecated-config'}
  | {type: 'unsupported'}

export interface AutoUpdateSettings {
  enabled: boolean
  issue: AutoUpdateIssue | null
}

/**
 * Owns the auto-update rules and returns plain facts, so each surface (build,
 * dev, deploy warnings, dry-run checks) decides its own presentation.
 *
 * @internal
 */
export function resolveAutoUpdates(sources: AutoUpdateSources): AutoUpdateSettings {
  const settings = resolveConfiguredAutoUpdates(sources)

  // A workbench app takes `sanity` from the shell's shared runtime, so it has no
  // version of its own to pin.
  // TODO(SDK-1045): confirm the long-term story with the studio team.
  if (settings.enabled && isWorkbenchApp(sources.cliConfig?.app)) {
    // A config conflict still fails — it's a problem with the config itself.
    return settings.issue?.type === 'conflicting-config'
      ? {enabled: false, issue: settings.issue}
      : {enabled: false, issue: {type: 'unsupported'}}
  }

  return settings
}

function resolveConfiguredAutoUpdates({cliConfig, flags}: AutoUpdateSources): AutoUpdateSettings {
  // Flags always take precedence over config
  if ('auto-updates' in flags) {
    const enabled = Boolean(flags['auto-updates'])
    return {
      enabled,
      issue: {flag: enabled ? '--auto-updates' : '--no-auto-updates', type: 'deprecated-flag'},
    }
  }

  const hasOldConfig = cliConfig && 'autoUpdates' in cliConfig

  const hasNewConfig =
    cliConfig &&
    'deployment' in cliConfig &&
    cliConfig.deployment &&
    'autoUpdates' in cliConfig.deployment

  if (hasNewConfig) {
    return {
      enabled: Boolean(cliConfig?.deployment?.autoUpdates),
      issue: hasOldConfig ? {type: 'conflicting-config'} : null,
    }
  }

  if (hasOldConfig) {
    return {enabled: Boolean(cliConfig?.autoUpdates), issue: {type: 'deprecated-config'}}
  }

  return {enabled: false, issue: null}
}

/**
 * The user-facing message for an auto-update configuration problem.
 * Shared by every surface that reports the issue (deploy warnings, dry-run
 * checks) so the wording has one home.
 *
 * @internal
 */
export function getAutoUpdateIssueMessage(issue: AutoUpdateIssue): string {
  switch (issue.type) {
    case 'conflicting-config': {
      return 'Found both `autoUpdates` (deprecated) and `deployment.autoUpdates` in sanity.cli.js/.ts. Please remove the deprecated top level `autoUpdates` config.'
    }
    case 'deprecated-config': {
      return 'The autoUpdates config has moved to deployment.autoUpdates.'
    }
    case 'deprecated-flag': {
      return `The ${issue.flag} flag is deprecated for deploy and build commands. Set the autoUpdates option in the deployment section of sanity.cli.ts or sanity.cli.js instead.`
    }
    case 'unsupported': {
      return "Auto-updates aren't supported yet — using the installed package versions"
    }
  }
}

/**
 * The styled before/after edit that migrates the deprecated top-level
 * `autoUpdates` to `deployment.autoUpdates`. Lives here so every surface that
 * reports the deprecated config (deploy warnings, dry-run checks) shows the
 * same migration hint.
 *
 * @internal
 */
export function getAutoUpdateMigrationHint(currentValue: unknown): string {
  return `Please update sanity.cli.ts or sanity.cli.js and make the following change:
  ${styleText('red', `-  autoUpdates: ${currentValue},`)}
  ${styleText('green', `+  deployment: {autoUpdates: ${currentValue}}`)}
`
}

/**
 * Resolves the auto-update setting and prints any configuration problem.
 * @remarks Throws an error if both the old and new auto update config are used; throws a warning if the old config is used, or if the auto updates flags are used.
 * @internal
 */
export function shouldAutoUpdate({
  cliConfig,
  flags,
  output,
}: AutoUpdateSources & {output: Output}): boolean {
  const {enabled, issue} = resolveAutoUpdates({cliConfig, flags})

  switch (issue?.type) {
    case 'conflicting-config': {
      output.error(getAutoUpdateIssueMessage(issue), {exit: 1})
      break
    }
    case 'deprecated-config': {
      output.warn(getAutoUpdateIssueMessage(issue))
      output.warn(getAutoUpdateMigrationHint(cliConfig.autoUpdates))
      break
    }
    case 'deprecated-flag':
    case 'unsupported': {
      output.warn(getAutoUpdateIssueMessage(issue))
      break
    }
    default: {
      break
    }
  }

  return enabled
}
