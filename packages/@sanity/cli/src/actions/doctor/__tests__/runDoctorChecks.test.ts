import {describe, expect, test} from 'vitest'

import {runDoctorChecks} from '../runDoctorChecks.js'
import {type CheckResult, type DoctorCheck} from '../types.js'

const createMockCheck = (name: string, title: string, result: CheckResult): DoctorCheck => ({
  name,
  run: async () => result,
  title,
})

describe('runDoctorChecks', () => {
  test('runs all checks and returns results with metadata', async () => {
    const checks: DoctorCheck[] = [
      createMockCheck('check-1', 'Check One', {
        messages: [{text: 'All good', type: 'success'}],
        status: 'passed',
      }),
      createMockCheck('check-2', 'Check Two', {
        messages: [{text: 'Something is wrong', type: 'error'}],
        status: 'error',
      }),
    ]

    const results = await runDoctorChecks({cwd: '/tmp'}, checks)

    expect(results.checks).toHaveLength(2)
    expect(results.checks[0].name).toBe('check-1')
    expect(results.checks[0].title).toBe('Check One')
    expect(results.checks[0].status).toBe('passed')
    expect(results.checks[1].name).toBe('check-2')
    expect(results.checks[1].status).toBe('error')
  })

  test('calculates summary correctly', async () => {
    const checks: DoctorCheck[] = [
      createMockCheck('pass-1', 'Pass 1', {messages: [], status: 'passed'}),
      createMockCheck('pass-2', 'Pass 2', {messages: [], status: 'passed'}),
      createMockCheck('warn-1', 'Warn 1', {messages: [], status: 'warning'}),
      createMockCheck('error-1', 'Error 1', {messages: [], status: 'error'}),
    ]

    const results = await runDoctorChecks({cwd: '/tmp'}, checks)

    expect(results.summary.passed).toBe(2)
    expect(results.summary.warnings).toBe(1)
    expect(results.summary.errors).toBe(1)
  })

  test('catches check errors and reports them gracefully', async () => {
    const checks: DoctorCheck[] = [
      createMockCheck('pass-1', 'Pass 1', {messages: [], status: 'passed'}),
      {
        name: 'failing',
        run: async () => {
          throw new Error('Permission denied: /etc/sanity')
        },
        title: 'Failing Check',
      },
      createMockCheck('pass-2', 'Pass 2', {messages: [], status: 'passed'}),
    ]

    const results = await runDoctorChecks({cwd: '/tmp'}, checks)

    // All three checks should be in results
    expect(results.checks).toHaveLength(3)

    // The failing check should be reported as an error, not crash the command
    const failedCheck = results.checks[1]
    expect(failedCheck.name).toBe('failing')
    expect(failedCheck.status).toBe('error')
    expect(failedCheck.messages).toHaveLength(1)
    expect(failedCheck.messages[0].type).toBe('error')
    expect(failedCheck.messages[0].text).toBe('Permission denied: /etc/sanity')

    // Subsequent checks should still run
    expect(results.checks[2].status).toBe('passed')

    // Summary should count the failure
    expect(results.summary.errors).toBe(1)
    expect(results.summary.passed).toBe(2)
  })

  test('handles non-Error throws gracefully', async () => {
    const checks: DoctorCheck[] = [
      {
        name: 'string-throw',
        run: async () => {
          throw 'unexpected string error'
        },
        title: 'String Throw',
      },
    ]

    const results = await runDoctorChecks({cwd: '/tmp'}, checks)

    expect(results.checks[0].status).toBe('error')
    expect(results.checks[0].messages[0].text).toBe('unexpected string error')
  })

  test('runs checks sequentially', async () => {
    const executionOrder: string[] = []

    const checks: DoctorCheck[] = [
      {
        name: 'first',
        run: async () => {
          executionOrder.push('first')
          return {messages: [], status: 'passed'}
        },
        title: 'First',
      },
      {
        name: 'second',
        run: async () => {
          executionOrder.push('second')
          return {messages: [], status: 'passed'}
        },
        title: 'Second',
      },
    ]

    await runDoctorChecks({cwd: '/tmp'}, checks)

    expect(executionOrder).toEqual(['first', 'second'])
  })
})
