import {
  type CheckResult,
  type CheckResultWithMeta,
  type DoctorCheck,
  type DoctorContext,
  type DoctorResults,
} from './types.js'

export async function runDoctorChecks(
  context: DoctorContext,
  checks: DoctorCheck[],
): Promise<DoctorResults> {
  const results: CheckResultWithMeta[] = []

  // Run checks sequentially (some may depend on earlier results in the future)
  for (const check of checks) {
    let result: CheckResult
    try {
      result = await check.run(context)
    } catch (err) {
      result = {
        messages: [{text: err instanceof Error ? err.message : String(err), type: 'error'}],
        status: 'error',
      }
    }
    results.push({
      ...result,
      name: check.name,
      title: check.title,
    })
  }

  // Calculate summary
  const summary = {errors: 0, passed: 0, warnings: 0}
  for (const result of results) {
    switch (result.status) {
      case 'error': {
        summary.errors++
        break
      }
      case 'passed': {
        summary.passed++
        break
      }
      case 'warning': {
        summary.warnings++
        break
      }
      // No default
    }
  }

  return {checks: results, summary}
}
