/**
 * Options for each fixture.
 * @public
 */
export interface FixtureOptions {
  includeDist?: boolean
}

/**
 * Name of the `pnpm-workspace.yaml` template bundled alongside the fixtures.
 *
 * The build generates it from the repository's own `pnpm-workspace.yaml` so fixture
 * installs apply the same install policy as the repository, and fixture setup writes
 * it into each fixture as its `pnpm-workspace.yaml`.
 *
 * @internal
 */
export const FIXTURE_WORKSPACE_FILE = 'fixture-workspace.yaml'

/**
 * Default fixtures bundled with the package and their options.
 *
 * @public
 */
export const DEFAULT_FIXTURES: Record<FixtureName, FixtureOptions> = {
  'basic-app': {},
  'basic-functions': {},
  'basic-studio': {},
  'federated-studio': {},
  'graphql-studio': {},
  'multi-workspace-studio': {},
  'nextjs-app': {},
  'prebuilt-app': {includeDist: true},
  'prebuilt-studio': {includeDist: true},
  'worst-case-studio': {},
} as const

/**
 * Valid fixture name type.
 * @public
 */
export type FixtureName =
  | 'basic-app'
  | 'basic-functions'
  | 'basic-studio'
  | 'federated-studio'
  | 'graphql-studio'
  | 'multi-workspace-studio'
  | 'nextjs-app'
  | 'prebuilt-app'
  | 'prebuilt-studio'
  | 'worst-case-studio'

/**
 * @deprecated Use {@link FixtureName} instead. This type alias will be removed in a future release.
 * @public
 */
export type ExampleName = FixtureName
