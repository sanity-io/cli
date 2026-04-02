import {describe, expect, test} from 'vitest'

import {validateProjection} from '../validateProjection.js'

describe('validateProjection', () => {
  test('accepts a simple projection', () => {
    expect(() => validateProjection('{ title, body }')).not.toThrow()
  })

  test('accepts a projection with computed fields', () => {
    expect(() => validateProjection('{ "fullName": firstName + " " + lastName }')).not.toThrow()
  })

  test('accepts a projection with nested objects', () => {
    expect(() => validateProjection('{ title, "nested": { a, b } }')).not.toThrow()
  })

  test('accepts a projection with spread', () => {
    expect(() => validateProjection('{ ..., title }')).not.toThrow()
  })

  test('accepts a conditional projection', () => {
    expect(() =>
      validateProjection('{ _type == "article" => { title, summary, "body": body } }'),
    ).not.toThrow()
  })

  test('accepts multiple conditional projections by type', () => {
    const projection = [
      '{',
      '  _type == "article" => { title, description, "body": body },',
      '  _type == "product" => { name, "description": description, category },',
      '  _type == "helpArticle" => { title, "body": body }',
      '}',
    ].join('\n')
    expect(() => validateProjection(projection)).not.toThrow()
  })

  test('throws on invalid syntax (missing comma)', () => {
    expect(() => validateProjection('{ title body }')).toThrow()
  })

  test('throws on invalid syntax (unclosed brace)', () => {
    expect(() => validateProjection('{ title')).toThrow()
  })

  test('throws on invalid syntax (empty key value)', () => {
    expect(() => validateProjection('{ title, "x": }')).toThrow()
  })

  test('throws on invalid syntax (unquoted computed key)', () => {
    expect(() =>
      validateProjection('{ _type == "article" => { title, summary, body: body } }'),
    ).toThrow()
  })

  test('accepts a projection with aliased field path', () => {
    expect(() => validateProjection('{ title, "slug": slug.current }')).not.toThrow()
  })

  test('accepts shared fields combined with type-specific projections', () => {
    expect(() =>
      validateProjection(
        '{ title, _type == "article" => { description }, _type == "product" => { "specs": specifications } }',
      ),
    ).not.toThrow()
  })

  test('throws on a filter expression', () => {
    expect(() => validateProjection('*[_type == "post"]')).toThrow(/Expected a GROQ projection/)
  })

  test('throws on a function call', () => {
    expect(() => validateProjection('count(*)')).toThrow(/Expected a GROQ projection/)
  })

  test('throws on a string literal', () => {
    expect(() => validateProjection('"just a string"')).toThrow(/Expected a GROQ projection/)
  })

  test('throws on dereferences', () => {
    expect(() => validateProjection('{ "authorName": author->name }')).toThrow(
      /must not contain dereferences/,
    )
  })

  test('throws on nested dereferences in arrays', () => {
    expect(() => validateProjection('{ title, "tag": tags[]->name }')).toThrow(
      /must not contain dereferences/,
    )
  })

  test('throws on dereference inside a filter condition', () => {
    expect(() => validateProjection('{ "filtered": items[author->name == "X"] }')).toThrow(
      /must not contain dereferences/,
    )
  })

  test('throws on dereference inside select()', () => {
    expect(() =>
      validateProjection('{ "label": select(author->name == "X" => "big", "small") }'),
    ).toThrow(/must not contain dereferences/)
  })

  test('throws on nested full queries', () => {
    expect(() => validateProjection('{ "ids": *[_type == "tag"]._id }')).toThrow(
      /must not contain full queries/,
    )
  })

  test('throws on full query inside select()', () => {
    expect(() =>
      validateProjection('{ "label": select(count(*[_type == "post"]) > 5 => "many", "few") }'),
    ).toThrow(/must not contain full queries/)
  })

  test('throws on user:: namespace functions', () => {
    expect(() => validateProjection('{ title, "loc": user::attributes().location }')).toThrow(
      /must not contain user:: functions/,
    )
  })
})
