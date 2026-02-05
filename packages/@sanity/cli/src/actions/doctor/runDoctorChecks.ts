import {
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
    const result = await check.run(context)
    results.push({
      ...result,
      name: check.name,
      title: check.title,
    })
  }

  // Calculate summary
  const summary = {
    errors: results.filter((r) => r.status === 'error').length,
    passed: results.filter((r) => r.status === 'passed').length,
    warnings: results.filter((r) => r.status === 'warning').length,
  }

  return {checks: results, summary}
}
