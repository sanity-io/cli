import {type SchemaValidationValue} from '@sanity/types'
import {describe, expect, test} from 'vitest'

import {retainSerializableProps} from '../schemaTypeTransformer.js'
import {transformValidation} from '../validationTransformer.js'

// Simplified rule spec type for testing. The actual RuleSpec from \@sanity/types
// is a discriminated union which makes it difficult to construct test data.
interface TestRuleSpec {
  flag: string

  constraint?: unknown
}

/**
 * Creates a mock Rule object matching the shape expected by transformValidation.
 * In production, these are produced by invoking validation functions with the Rule builder;
 * Schema.compile() does not invoke them, so we construct them directly.
 */
function createRule(
  rules: TestRuleSpec[],
  options?: {level?: 'error' | 'info' | 'warning'; message?: string},
): SchemaValidationValue {
  return {
    _level: options?.level ?? 'error',
    _message: options?.message,
    _rules: rules,
    _type: 'Rule',
  } as unknown as SchemaValidationValue
}

function getFlags(result: ReturnType<typeof transformValidation>): string[] {
  if (!('validation' in result)) return []
  return result.validation.flatMap((g) => g.rules.map((r) => r.flag))
}

describe('validationTransformer', () => {
  test('should serialize object validation: required, with error level', () => {
    const result = transformValidation(
      [createRule([{constraint: 'required', flag: 'presence'}])],
      retainSerializableProps,
    )

    expect('validation' in result).toBe(true)
    if ('validation' in result) {
      expect(result.validation[0].level).toBe('error')
      const flags = getFlags(result)
      expect(flags).toContain('presence')
    }
  })

  test('should serialize validation with warning and info levels', () => {
    const result = transformValidation(
      [
        createRule([{constraint: 50, flag: 'max'}], {level: 'warning'}),
        createRule([{constraint: 'required', flag: 'presence'}], {level: 'info'}),
      ],
      retainSerializableProps,
    )

    expect('validation' in result).toBe(true)
    if ('validation' in result) {
      const warningGroup = result.validation.find((g) => g.level === 'warning')
      expect(warningGroup).toBeDefined()
      expect(warningGroup!.rules.some((r) => r.flag === 'max')).toBe(true)

      const infoGroup = result.validation.find((g) => g.level === 'info')
      expect(infoGroup).toBeDefined()
      expect(infoGroup!.rules.some((r) => r.flag === 'presence')).toBe(true)
    }
  })

  test('should serialize validation with custom message', () => {
    const result = transformValidation(
      [
        createRule([{constraint: 'required', flag: 'presence'}], {
          message: 'This field is required',
        }),
      ],
      retainSerializableProps,
    )

    expect('validation' in result).toBe(true)
    if ('validation' in result) {
      expect(result.validation[0].message).toBe('This field is required')
    }
  })

  test('should serialize array validation: required, unique, min, max', () => {
    const result = transformValidation(
      [
        createRule([
          {constraint: 'required', flag: 'presence'},
          {constraint: true, flag: 'unique'},
          {constraint: 1, flag: 'min'},
          {constraint: 10, flag: 'max'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).toContain('presence')
    expect(flags).toContain('unique')
    expect(flags).toContain('min')
    expect(flags).toContain('max')
  })

  test('should serialize date validation: required, min, max', () => {
    const result = transformValidation(
      [
        createRule([
          {constraint: 'required', flag: 'presence'},
          {constraint: '2020-01-01', flag: 'min'},
          {constraint: '2030-12-31', flag: 'max'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).toContain('presence')
    expect(flags).toContain('min')
    expect(flags).toContain('max')

    if ('validation' in result) {
      const minRule = result.validation[0].rules.find((r) => r.flag === 'min')
      expect(minRule!.constraint).toBe('2020-01-01')
      const maxRule = result.validation[0].rules.find((r) => r.flag === 'max')
      expect(maxRule!.constraint).toBe('2030-12-31')
    }
  })

  test('should serialize number validation: required, min, max, integer, positive, greaterThan, lessThan, precision', () => {
    const result = transformValidation(
      [
        createRule([
          {constraint: 'required', flag: 'presence'},
          {constraint: 0, flag: 'min'},
          {constraint: 100, flag: 'max'},
          {constraint: true, flag: 'integer'},
          {constraint: true, flag: 'positive'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).toContain('presence')
    expect(flags).toContain('min')
    expect(flags).toContain('max')
    expect(flags).toContain('integer')
    expect(flags).toContain('positive')

    const result2 = transformValidation(
      [
        createRule([
          {constraint: 0, flag: 'greaterThan'},
          {constraint: 1000, flag: 'lessThan'},
          {constraint: 2, flag: 'precision'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags2 = getFlags(result2)
    expect(flags2).toContain('greaterThan')
    expect(flags2).toContain('lessThan')
    expect(flags2).toContain('precision')
  })

  test('should serialize string validation: required, max, min, length, uppercase, email, regex', () => {
    const result = transformValidation(
      [
        createRule([
          {constraint: 'required', flag: 'presence'},
          {constraint: 2, flag: 'min'},
          {constraint: 50, flag: 'max'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).toContain('presence')
    expect(flags).toContain('min')
    expect(flags).toContain('max')

    const result2 = transformValidation(
      [
        createRule([
          {constraint: 'uppercase', flag: 'stringCasing'},
          {constraint: 5, flag: 'length'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags2 = getFlags(result2)
    expect(flags2).toContain('stringCasing')
    expect(flags2).toContain('length')

    const result3 = transformValidation(
      [createRule([{constraint: true, flag: 'email'}])],
      retainSerializableProps,
    )
    expect(getFlags(result3)).toContain('email')

    const result4 = transformValidation(
      [createRule([{constraint: /^[a-z]+$/, flag: 'regex'}])],
      retainSerializableProps,
    )
    const regexFlags = getFlags(result4)
    expect(regexFlags).toContain('regex')

    // Verify regex is serialized as string
    if ('validation' in result4) {
      const regexRule = result4.validation[0].rules.find((r) => r.flag === 'regex')
      expect(regexRule!.constraint).toBe('/^[a-z]+$/')
    }
  })

  test('should serialize URL validation: required, uri with options', () => {
    const result = transformValidation(
      [
        createRule([
          {constraint: 'required', flag: 'presence'},
          {
            constraint: {
              allowRelative: true,
              scheme: [/^http$/, /^https$/],
            },
            flag: 'uri',
          },
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).toContain('presence')
    expect(flags).toContain('uri')

    if ('validation' in result) {
      const uriRule = result.validation[0].rules.find((r) => r.flag === 'uri')
      expect(uriRule).toBeDefined()
      // URI constraint should be serialized with scheme regexes as strings
      const constraint = uriRule!.constraint as Record<string, unknown>
      expect(constraint.allowRelative).toBe(true)
    }
  })

  test('should filter out type validation flag', () => {
    // The 'type' flag is implicit from the typedef and is filtered out
    const result = transformValidation(
      [
        createRule([
          {constraint: 'String', flag: 'type'},
          {constraint: 'required', flag: 'presence'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).not.toContain('type')
    expect(flags).toContain('presence')
  })

  test('should filter out validation rules that reference other fields (FIELD_REF)', () => {
    const fieldRefSymbol = Symbol('FIELD_REF')
    const result = transformValidation(
      [
        createRule([
          {
            constraint: {path: ['otherField'], type: fieldRefSymbol},
            flag: 'min',
          },
          {constraint: 'required', flag: 'presence'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    // FIELD_REF constraints should be filtered out
    expect(flags).not.toContain('min')
    expect(flags).toContain('presence')
  })

  test('should return empty object when no valid rules exist', () => {
    // Only has 'type' flag which gets filtered
    const result = transformValidation(
      [createRule([{constraint: 'Number', flag: 'type'}])],
      retainSerializableProps,
    )

    expect('validation' in result).toBe(false)
  })

  test('should return empty object for empty/undefined validation', () => {
    const result1 = transformValidation([], retainSerializableProps)
    expect('validation' in result1).toBe(false)

    // @ts-expect-error — testing undefined input defensively
    const result2 = transformValidation(undefined, retainSerializableProps)
    expect('validation' in result2).toBe(false)
  })

  test('should filter out rules without constraint property', () => {
    const result = transformValidation(
      [
        createRule([
          // Rule without 'constraint' property should be filtered
          {flag: 'custom'},
          {constraint: 'required', flag: 'presence'},
        ]),
      ],
      retainSerializableProps,
    )

    const flags = getFlags(result)
    expect(flags).not.toContain('custom')
    expect(flags).toContain('presence')
  })
})
