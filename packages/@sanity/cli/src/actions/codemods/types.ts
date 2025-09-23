export interface CodeMod {
  description: string
  // Must match filename in `cli/codemods/`
  filename: string
  purpose: string

  verify?: (context: {workDir: string}) => Promise<void>
}
