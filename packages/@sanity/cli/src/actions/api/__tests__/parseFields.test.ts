import {describe, expect, test, vi} from 'vitest'

import {ApiUsageError} from '../errors.js'
import {fieldsToQuery, parseFields} from '../parseFields.js'

describe('parseFields', () => {
  test('keeps raw field values as strings', () => {
    expect(parseFields({rawFields: ['count=42', 'flag=true', 'nothing=null']})).toEqual({
      count: '42',
      flag: 'true',
      nothing: 'null',
    })
  })

  test('allows "=" in raw field values', () => {
    expect(parseFields({rawFields: ['query=*[_type == "movie"]']})).toEqual({
      query: '*[_type == "movie"]',
    })
  })

  test('converts typed field values', () => {
    expect(
      parseFields({
        fields: ['yes=true', 'no=false', 'nothing=null', 'int=42', 'float=-1.5', 'name=hello'],
      }),
    ).toEqual({float: -1.5, int: 42, name: 'hello', no: false, nothing: null, yes: true})
  })

  test('reads typed field value from a file with @', () => {
    const readFile = vi.fn().mockReturnValue('file contents')
    expect(parseFields({fields: ['data=@body.txt'], readFile})).toEqual({data: 'file contents'})
    expect(readFile).toHaveBeenCalledWith('body.txt')
  })

  test('reads typed field value from stdin with @-', () => {
    expect(parseFields({fields: ['data=@-'], stdin: 'stdin contents'})).toEqual({
      data: 'stdin contents',
    })
  })

  test('throws when @- is used without stdin', () => {
    expect(() => parseFields({fields: ['data=@-']})).toThrow(ApiUsageError)
  })

  test('wraps file read errors', () => {
    const readFile = vi.fn().mockImplementation(() => {
      throw new Error('ENOENT')
    })
    expect(() => parseFields({fields: ['data=@missing.txt'], readFile})).toThrow(
      /Failed to read "missing.txt"/,
    )
  })

  test('builds nested objects with bracket keys', () => {
    expect(parseFields({fields: ['a[b]=1', 'a[c]=2']})).toEqual({a: {b: 1, c: 2}})
  })

  test('appends to arrays with empty brackets', () => {
    expect(parseFields({fields: ['ids[]=1', 'ids[]=2']})).toEqual({ids: [1, 2]})
  })

  test('declares an empty array with a bare key[]', () => {
    expect(parseFields({rawFields: ['empty[]']})).toEqual({empty: []})
    expect(parseFields({fields: ['empty[]']})).toEqual({empty: []})
  })

  test('builds objects inside arrays', () => {
    expect(parseFields({fields: ['items[][id]=1']})).toEqual({items: [{id: 1}]})
  })

  test('fills the current array element until a key repeats', () => {
    expect(
      parseFields({
        rawFields: [
          'labels[][name]=bug',
          'labels[][color]=red',
          'labels[][name]=feature',
          'labels[][color]=green',
        ],
      }),
    ).toEqual({
      labels: [
        {color: 'red', name: 'bug'},
        {color: 'green', name: 'feature'},
      ],
    })
  })

  test('starts a new array element when a key repeats', () => {
    expect(parseFields({fields: ['items[][id]=1', 'items[][id]=2']})).toEqual({
      items: [{id: 1}, {id: 2}],
    })
  })

  test('keeps filling nested arrays of the current array element', () => {
    expect(
      parseFields({
        rawFields: [
          'labels[][name]=bug',
          'labels[][colorOptions][]=red',
          'labels[][colorOptions][]=blue',
          'labels[][name]=feature',
          'labels[][colorOptions][]=green',
        ],
      }),
    ).toEqual({
      labels: [
        {colorOptions: ['red', 'blue'], name: 'bug'},
        {colorOptions: ['green'], name: 'feature'},
      ],
    })
  })

  test('builds deeply nested objects inside arrays', () => {
    expect(parseFields({rawFields: ['nested[][key1][key2][key3]=value']})).toEqual({
      nested: [{key1: {key2: {key3: 'value'}}}],
    })
  })

  test('starts a new array element after a scalar element', () => {
    expect(parseFields({rawFields: ['robots[]=Hubot', 'robots[][name]=Dependabot']})).toEqual({
      robots: ['Hubot', {name: 'Dependabot'}],
    })
  })

  test('keeps @-prefixed raw field values literal', () => {
    expect(parseFields({rawFields: ['location=@work']})).toEqual({location: '@work'})
  })

  test('throws on duplicate keys', () => {
    expect(() => parseFields({fields: ['a=1', 'a=2']})).toThrow(/conflicts/)
  })

  test('throws when nesting conflicts with a scalar', () => {
    expect(() => parseFields({fields: ['a=1', 'a[b]=2']})).toThrow(/conflicts/)
  })

  test('throws when array and non-array uses conflict', () => {
    expect(() => parseFields({rawFields: ['a[]=1', 'a=2']})).toThrow(/conflicts/)
    expect(() => parseFields({rawFields: ['a=1', 'a[]=2']})).toThrow(/conflicts/)
    expect(() => parseFields({rawFields: ['a[b]=1', 'a[]=2']})).toThrow(/conflicts/)
    expect(() => parseFields({rawFields: ['a[]=1', 'a[b]=2']})).toThrow(/conflicts/)
  })

  test('throws on missing "=" separator', () => {
    expect(() => parseFields({fields: ['oops']})).toThrow(/expected key=value/)
  })

  test('throws on empty key', () => {
    expect(() => parseFields({fields: ['=value']})).toThrow(/expected key=value/)
  })

  test('throws on malformed bracket keys', () => {
    expect(() => parseFields({fields: ['a[b=1']})).toThrow(ApiUsageError)
  })

  test('treats __proto__ as an ordinary key without polluting prototypes', () => {
    const result = parseFields({fields: ['__proto__[polluted]=1', 'safe=2']})

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(JSON.stringify(result)).toBe('{"__proto__":{"polluted":1},"safe":2}')
  })

  test('supports field keys that shadow inherited object properties', () => {
    expect(parseFields({fields: ['toString=a', 'constructor=b', 'hasOwnProperty=c']})).toEqual({
      constructor: 'b',
      hasOwnProperty: 'c',
      toString: 'a',
    })
  })
})

describe('fieldsToQuery', () => {
  test('stringifies scalar values', () => {
    expect(fieldsToQuery({flag: true, limit: 10, name: 'test', nothing: null})).toEqual({
      flag: 'true',
      limit: '10',
      name: 'test',
      nothing: 'null',
    })
  })

  test('supports arrays of scalars', () => {
    expect(fieldsToQuery({ids: ['1', 2]})).toEqual({ids: ['1', '2']})
  })

  test('throws on nested objects', () => {
    expect(() => fieldsToQuery({nested: {a: '1'}})).toThrow(/query parameter/)
  })

  test('throws on arrays of objects', () => {
    expect(() => fieldsToQuery({items: [{a: '1'}]})).toThrow(/query parameter/)
  })
})
