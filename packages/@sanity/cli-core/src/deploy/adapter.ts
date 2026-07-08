// The deploy contract `sanity deploy` runs against. It lives in cli-core so
// adapter implementations can come from other packages (the workbench
// adapters live in @sanity/workbench-cli) without depending on @sanity/cli.

import {readdir, stat} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'

import {type CliConfig} from '../config/cli/types/cliConfig.js'
import {type ProjectRootResult} from '../config/util/recursivelyResolveProjectRoot.js'
import {type Output} from '../types.js'
import {type DeployCheck, type DeployTarget, enforce, type TargetCheck} from './checks.js'

export type DeployedApplicationType = 'coreApp' | 'studio'

/** The `sanity deploy` flags, decoupled from the command so adapters don't depend on oclif parsing. */
export interface DeployFlags {
  build: boolean
  'dry-run': boolean
  external: boolean
  json: boolean
  minify: boolean
  'schema-required': boolean
  'source-maps': boolean
  verbose: boolean
  yes: boolean

  'auto-updates'?: boolean
  title?: string
  url?: string
}

export interface DeployAppOptions {
  cliConfig: CliConfig
  flags: DeployFlags
  output: Output
  projectRoot: ProjectRootResult
  sourceDir: string
}

/**
 * What the flow learns while checking, threaded into the later slots.
 * Adapters extend it with their own fields (resolved application, workbench
 * declarations, installation ids).
 */
export interface DeployState {
  /** Installed framework version the deploy uses; `null` fails the version check. */
  version: string | null

  /** Workbench views and services registered with the deploy. */
  exposes?: DeployedExpose[]
  /** Media-library installation config summary, when a singleton config deploys. */
  installationConfig?: string | null
  /** `false` when the deploy uploads nothing (externally hosted studio). */
  uploadsFiles?: boolean
}

/**
 * One kind of deploy — plain studio, plain app, workbench studio, workbench
 * app — as slot implementations for the one flow in {@link planDeploy} and
 * {@link executeDeploy}: config checks → target → build checks → deploy.
 * Adapters never see `--dry-run`; the two flows pick the slots. The generic
 * ties an adapter's plans and results to its application type.
 */
export interface DeployAdapter<
  T extends DeployedApplicationType = DeployedApplicationType,
  State extends DeployState = DeployState,
> {
  /** Acquires the target for a real deploy — may prompt or create — and folds it into the state. */
  acquireTarget(options: DeployAppOptions, state: State): Promise<State>
  /** Fast, read-only config checks; seeds the state the later slots read. */
  check(options: DeployAppOptions): Promise<{checks: DeployCheck[]; state: State}>
  /** Build, output verification, and the checks that need the built output. */
  checkOutput(
    options: DeployAppOptions,
    state: State,
  ): Promise<{checks: DeployCheck[]; state: State}>
  /** The mutating tail: uploads, registrations, success output. Runs only after every check passed. */
  deploy(options: DeployAppOptions, state: State): Promise<DeployResult<T> | undefined>
  /** Read-only target diagnosis; `null` when this deploy has no target to report. */
  describeTarget(options: DeployAppOptions, state: State): Promise<TargetCheck | null>
  readonly type: T
}

/** The dry run: every slot except the mutating tail, collected into a report. */
export async function planDeploy<T extends DeployedApplicationType, State extends DeployState>(
  adapter: DeployAdapter<T, State>,
  options: DeployAppOptions,
): Promise<DeploymentPlan<T>> {
  const checks: DeployCheck[] = []

  const checked = await adapter.check(options)
  checks.push(...checked.checks)

  const target = await adapter.describeTarget(options, checked.state)
  if (target) checks.push(target.check)

  const output = await adapter.checkOutput(options, checked.state)
  checks.push(...output.checks)

  const {state} = output
  const plan = newPlan({
    checks,
    exposes: state.exposes ?? [],
    installationConfig: state.installationConfig ?? null,
    target: target?.target ?? null,
    type: adapter.type,
    version: state.version,
  })
  // A blocked deploy uploads nothing, so only enumerate files for a deployable plan.
  if (isDeployable(plan) && state.uploadsFiles !== false) {
    plan.files = await listDeploymentFiles(options.sourceDir, options.projectRoot.directory)
  }
  return plan
}

/** The real deploy: fail-fast through the same slots, then the mutating tail. */
export async function executeDeploy<T extends DeployedApplicationType, State extends DeployState>(
  adapter: DeployAdapter<T, State>,
  options: DeployAppOptions,
): Promise<DeployResult<T> | undefined> {
  const {output} = options

  const checked = await adapter.check(options)
  for (const check of checked.checks) enforce(output, check)

  const state = await adapter.acquireTarget(options, checked.state)

  const outputChecks = await adapter.checkOutput(options, state)
  for (const check of outputChecks.checks) enforce(output, check)

  return adapter.deploy(options, outputChecks.state)
}

/** A view or service as the deploy report and `--json` output surface it. */
export interface DeployedExpose {
  name: string
  title: string
  type: string
}

/** What a real deploy produced — the payload `--json` reports. */
export interface DeployResult<T extends DeployedApplicationType = DeployedApplicationType> {
  applicationType: T
  /** Installed framework version the deploy used (`sanity` or `@sanity/sdk-react`). */
  applicationVersion: string
  /** Same shape as the dry-run plan's target; `null` for a config-only singleton deploy. */
  target: DeployTarget | null

  /** Workbench views and services registered with the deploy. */
  exposes?: DeployedExpose[]
  /** Media-library installation config summary, when a singleton config deployed. */
  installationConfig?: string
  /** Set when a media-library singleton deployed its installation config. */
  installationId?: string
}

/** What a `--dry-run` deploy would do: the real deploy sequence with every mutation gated off. */
export interface DeploymentPlan<T extends DeployedApplicationType = DeployedApplicationType> {
  checks: DeployCheck[]
  exposes: DeployedExpose[]
  files: DeploymentFile[]
  installationConfig: string | null
  target: DeployTarget | null
  type: T
  version: string | null
}

export interface DeploymentFile {
  /** Path relative to the project root, POSIX-style. */
  path: string
  size: number
}

export function newPlan<T extends DeployedApplicationType>(
  parts: Partial<DeploymentPlan<T>> &
    Pick<DeploymentPlan<T>, 'checks' | 'target' | 'type' | 'version'>,
): DeploymentPlan<T> {
  return {exposes: [], files: [], installationConfig: null, ...parts}
}

export function isDeployable(plan: DeploymentPlan): boolean {
  return plan.checks.every((check) => check.status !== 'fail')
}

/**
 * Lists the files a deploy would pack from `sourceDir`, as paths relative to
 * `fromDir`. A missing directory yields an empty list rather than throwing.
 */
export async function listDeploymentFiles(
  sourceDir: string,
  fromDir: string,
): Promise<DeploymentFile[]> {
  const walk = async (dir: string): Promise<string[]> => {
    let entries
    try {
      entries = await readdir(dir, {withFileTypes: true})
    } catch {
      return []
    }
    const nested = await Promise.all(
      entries.map((entry) => {
        const full = join(dir, entry.name)
        return entry.isDirectory() ? walk(full) : Promise.resolve([full])
      }),
    )
    return nested.flat()
  }

  const absolute = await walk(sourceDir)
  const files = await Promise.all(
    absolute.map(async (file) => ({
      // Deploy paths are POSIX-style regardless of the host OS (Windows gives `\`).
      path: relative(fromDir, file).split(sep).join('/'),
      size: (await stat(file)).size,
    })),
  )
  return files.toSorted((a, b) => a.path.localeCompare(b.path))
}
