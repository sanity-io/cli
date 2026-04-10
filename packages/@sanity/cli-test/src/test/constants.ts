/**
 * Options for each fixture.
 * @public
 */
export interface FixtureOptions {
  includeDist?: boolean
}

/**
 * Default fixtures bundled with the package and their options.
 *
 * @public
 */
export const DEFAULT_FIXTURES: Record<FixtureName, FixtureOptions> = {
  'basic-app': {},
  'basic-functions': {},
  'basic-studio': {},
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
