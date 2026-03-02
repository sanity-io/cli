export type CoverageSummary = {
  [filePath: string]: FileCoverageData
  total: FileCoverageData
}

export type FileDelta = {
  baseline: number | null
  current: number
  delta: number | null
  displayName: string
}

type CoverageMetric = {
  covered: number
  pct: number
  skipped: number
  total: number
}

type FileCoverageData = {
  branches: CoverageMetric
  functions: CoverageMetric
  lines: CoverageMetric
  statements: CoverageMetric
}
