import {describe, expect, test} from 'vitest'

import {logoImage} from '../../generated/logoImage.js'
import {terminalLogoForReply} from '../terminalLogo.js'

const KITTY_OK = '\u001B_Gi=31;OK\u001B\\'
const DA1 = '\u001B[?62;22c'

function drawnImage(sequence: string | undefined) {
  if (sequence?.includes(logoImage.onDarkBackground.slice(0, 4096))) return 'onDarkBackground'
  if (sequence?.includes(logoImage.onLightBackground.slice(0, 4096))) return 'onLightBackground'
  return undefined
}

describe('terminalLogoForReply', () => {
  test('draws nothing when the terminal does not answer the kitty graphics query', () => {
    expect(terminalLogoForReply(`\u001B]11;rgb:0000/0000/0000\u001B\\${DA1}`)).toBeUndefined()
  })

  test.each([
    [
      'light background, 2-digit channels',
      `${KITTY_OK}\u001B]11;rgb:ee/ee/ee\u0007${DA1}`,
      'onLightBackground',
    ],
    [
      'dark background, 4-digit channels',
      `${KITTY_OK}\u001B]11;rgb:1e1e/1e1e/2828\u001B\\${DA1}`,
      'onDarkBackground',
    ],
    ['unknown background', `${KITTY_OK}${DA1}`, 'onDarkBackground'],
  ])('picks the logo for a %s', (_, reply, expected) => {
    expect(drawnImage(terminalLogoForReply(reply))).toBe(expected)
  })
})
