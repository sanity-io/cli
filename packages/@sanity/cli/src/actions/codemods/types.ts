import {type Output} from '@sanity/cli-core'

export interface CodeMod {
  description: string
  // Must match filename in `cli/codemods/`
  filename: string
  purpose: string

  /**
   * Runs in the CLI process before the transform (prompts, API lookups). `options` reach the
   * transform's `options` argument; `paths` replace the default target of the whole directory.
   */
  prepare?: (context: {output: Output; workDir: string}) => Promise<{
    options: Record<string, string>
    paths: string[]
  }>
  verify?: (context: {workDir: string}) => Promise<void>
}
