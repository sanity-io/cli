import {describe, expect, test} from 'vitest'

import {isTar} from '../isTar.js'

describe('isTar', () => {
  test('returns true for a buffer with valid TAR magic bytes at offset 257', () => {
    const buf = Buffer.alloc(512)
    // Write 'ustar' at offset 257
    buf[257] = 0x75
    buf[258] = 0x73
    buf[259] = 0x74
    buf[260] = 0x61
    buf[261] = 0x72
    expect(isTar(buf)).toBe(true)
  })

  test('returns false for an empty buffer', () => {
    expect(isTar(Buffer.alloc(0))).toBe(false)
  })

  test('returns false for a buffer shorter than 262 bytes', () => {
    expect(isTar(Buffer.alloc(261))).toBe(false)
  })

  test('returns false for a buffer with wrong bytes at offset 257', () => {
    const buf = Buffer.alloc(512)
    buf[257] = 0x00
    buf[258] = 0x00
    buf[259] = 0x00
    buf[260] = 0x00
    buf[261] = 0x00
    expect(isTar(buf)).toBe(false)
  })
})
