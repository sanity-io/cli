/**
 * Default fixture names bundled with the package.
 * @public
 */
export const DEFAULT_FIXTURES = [
  'basic-app',
  'basic-studio',
  'multi-workspace-studio',
  'worst-case-studio',
] as const

/**
 * Valid fixture name type.
 * @public
 */
export type FixtureName = (typeof DEFAULT_FIXTURES)[number]

/**
 * @deprecated Use {@link FixtureName} instead. This type alias will be removed in a future release.
 * @public
 */
export type ExampleName = FixtureName
