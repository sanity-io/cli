import {readFileSync} from 'node:fs'

import {type SchemaType} from 'groq-js'
import {describe, expect, it} from 'vitest'

import {inferGroqParams, syntaxDiagnostic} from '../params.js'

const schema = JSON.parse(
  readFileSync(new URL('../../example/schema.json', import.meta.url), 'utf8'),
) as SchemaType

function params(query: string): Record<string, string> {
  const result = inferGroqParams(query, schema)
  if (!result.ok) throw new Error(syntaxDiagnostic(result.error).message)
  return Object.fromEntries(result.params.map((param) => [param.name, param.type]))
}

describe('inferGroqParams', () => {
  it('types a field comparison, including string enums', () => {
    expect(params('*[_type == "post" && slug.current == $slug]{title}')).toEqual({slug: 'string'})
    expect(params('*[_type == "post" && role == $role]')).toEqual({role: '"admin" | "member"'})
    expect(params('*[_type == "post" && views > $minViews]')).toEqual({minViews: 'number'})
    expect(params('*[_type == "post" && $role != role]')).toEqual({role: '"admin" | "member"'})
    expect(params('*[_type == "post" && (role) == ($role)]')).toEqual({role: '"admin" | "member"'})
  })

  it('widens a comparison against a literal and keeps an `in` list', () => {
    expect(params('*[_type == "post" && $role == "admin"]')).toEqual({role: 'string'})
    expect(params('*[_type == "post" && $n == 1 && $b == true && $z == null]')).toEqual({
      b: 'boolean',
      n: 'number',
      z: 'null',
    })
    expect(params('*[_type == "post" && $role in ["admin", "member"]]')).toEqual({
      role: '"admin" | "member"',
    })
    expect(params('*[_type == "post" && $n in [1, true, null, role]]')).toEqual({
      n: '"admin" | "member" | 1 | null | true',
    })
    expect(params('*[_type == "post" && $x in []]')).toEqual({x: 'unknown'})
  })

  it('keeps array fields as arrays and strips them for `in`', () => {
    expect(params('*[_type == "post" && tags == $tags]')).toEqual({tags: 'string[]'})
    expect(params('*[_type == "post" && $tag in tags]')).toEqual({tag: 'string'})
    expect(params('*[_type == "post" && $tag in (tags)]')).toEqual({tag: 'string'})
    expect(params('*[_type == "post" && title match $term]')).toEqual({term: 'string'})
  })

  it('types dereferences, `in` arrays, slices, and unconstrained placeholders', () => {
    expect(params('*[_type == "post" && author->name == $name]')).toEqual({name: 'string'})
    expect(params('*[_type == "post" && _id in $ids]')).toEqual({ids: 'string[]'})
    expect(params('*[$start..$end]')).toEqual({end: 'number', start: 'number'})
    expect(params('*[0...$end]')).toEqual({end: 'number'})
    expect(params('*[_type == "post" && $q]')).toEqual({q: 'unknown'})
    expect(params('*[_type == "post"][$i]')).toEqual({i: 'unknown'})
    expect(params('*[_type == "post" && author->missing == $x]')).toEqual({x: 'unknown'})
    expect(params('*[_type == "post" && slug->current == $x]')).toEqual({x: 'unknown'})
  })

  it('does not read slice bounds inside string literals', () => {
    expect(params('*[_type == "post" && title == "[0..$x]"]')).toEqual({})
    expect(params(`*[_type == "post" && title == '[$a..$b]' && views > $v]`)).toEqual({v: 'number'})
  })

  it('narrows the document type from the filter', () => {
    expect(params('*[_type == "author" && name == $name]')).toEqual({name: 'string'})
    expect(params('*[_type in ["author", "post"] && _id == $id]')).toEqual({id: 'string'})
    expect(params('*[name == $name]')).toEqual({name: 'string'})
    expect(params('*[!(_type == "post") && name == $name]')).toEqual({name: 'string'})
    expect(params('*[(_type == "post" || title == "x") && name == $name]')).toEqual({
      name: 'string',
    })
    expect(params('*[(_type == "post" || _type == "author") && name == $name]')).toEqual({
      name: 'string',
    })
    expect(params('*[_type in [] && name == $name]')).toEqual({name: 'string'})
    expect(params('*[_type == "post"][_type == "author" && name == $name]')).toEqual({
      name: 'unknown',
    })
    expect(params('*[_type == "post"][0...10][views > $v]')).toEqual({v: 'number'})
    expect(params('*[_type == "post"]{"authors": *[_type == "author" && name == $n]}')).toEqual({
      n: 'string',
    })
    expect(params('*[_type == "post" && count(*[_type == "author" && name == $n]) > 0]')).toEqual({
      n: 'string',
    })
    expect(params('*[_type == "post"]{"t": tags[title == $t]}')).toEqual({t: 'unknown'})
    expect(params('*[_type == "post"] | order(views)[views > $v]')).toEqual({v: 'number'})
  })

  it('walks every expression kind that can hold a placeholder', () => {
    expect(
      params(`*[_type == "post"]{
        "a": select(role == $role => 1, $fallback),
        "b": coalesce(title, $title),
        "c": count(tags[@ == $tag]),
        "d": [$x, views],
        "e": ($y),
        "f": -views + $z,
        "g": !$flag,
        "h": views in $lo..$hi,
        "i": tags[]->,
        ...select($cond => {title}),
        $spread == views => {views},
      } | order(views desc)[0...$limit]`),
    ).toEqual({
      cond: 'unknown',
      fallback: 'unknown',
      flag: 'unknown',
      hi: 'unknown',
      limit: 'number',
      lo: 'unknown',
      role: '"admin" | "member"',
      spread: 'number',
      tag: 'unknown',
      title: 'unknown',
      x: 'unknown',
      y: 'unknown',
      z: 'unknown',
    })
    expect(params('*[_type == "post"]{...$obj}')).toEqual({obj: 'unknown'})
    expect(params('*[_type == "post" && $a == $b]')).toEqual({a: 'unknown', b: 'unknown'})
    expect(params('*[_type == "post"] | score(title match $term)')).toEqual({term: 'string'})
    expect(params('*[_type == "post"]{"t": title, "n": $n}[0].n')).toEqual({n: 'unknown'})
    expect(params('*[_type == "post" && $p in path("a.*")]')).toEqual({p: 'unknown'})
    expect(params('*[_type == "post" && dateTime(_updatedAt) > dateTime($since)]')).toEqual({
      since: 'unknown',
    })
    expect(params('*[_type == "post" && @ == $self]')).toEqual({self: 'unknown'})
    expect(params('*[_type == "post" && ^ == $parent]')).toEqual({parent: 'unknown'})
  })

  it('reports a syntax error with a utf-16 offset', () => {
    const result = inferGroqParams('[', schema)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const diagnostic = syntaxDiagnostic(result.error)
    expect(diagnostic.position).toBe(1)
    expect(diagnostic.message.length).toBeGreaterThan(0)
    expect(syntaxDiagnostic(new Error('boom'))).toEqual({message: 'boom', position: 0})
    expect(syntaxDiagnostic('x')).toEqual({message: 'GROQ syntax error', position: 0})
  })
})
