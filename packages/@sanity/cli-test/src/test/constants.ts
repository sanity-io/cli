export const DEFAULT_EXAMPLES = [
  'basic-app',
  'basic-studio',
  'multi-workspace-studio',
  'worst-case-studio',
] as const

export type ExampleName = (typeof DEFAULT_EXAMPLES)[number]
