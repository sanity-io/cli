/**
 * Terminal Logo Generator
 *
 * Fetches the Sanity mark and wordmark from svgl (https://svgl.app), lays them
 * out side by side, and rasterizes them to transparent PNGs with
 * `rsvg-convert` (`brew install librsvg`). The result is committed as a
 * generated module so the CLI never reads an asset from disk at runtime.
 *
 * Regenerate: pnpm generate:logo-image
 */

/* eslint-disable no-console */
import {execFileSync} from 'node:child_process'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'

const OUTPUT_PATH = join(import.meta.dirname, '..', 'src', 'generated', 'logoImage.ts')
const MARK_URL = 'https://svgl.app/library/sanity-dark.svg'
const WORDMARK_URL = 'https://svgl.app/library/sanity-wordmark-dark.svg'

// Rendered pixel height. The terminal scales the image down to the rows it is
// placed over, so this only needs to be sharp on high-density displays.
const HEIGHT_PX = 144

async function fetchSvgBody(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
  const svg = await response.text()
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

const [mark, wordmark] = await Promise.all([fetchSvgBody(MARK_URL), fetchSvgBody(WORDMARK_URL)])

function render(color: string): string {
  // The wordmark's viewBox is 435x154 with the cap height spanning y 7–118.
  // The mark's drawing spans x 24–164, y 41.6–152 of its 192x192 viewBox, so it
  // is cropped to that box and scaled to the wordmark's cap height.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 611 154">
<svg x="0" y="7" width="141" height="111" viewBox="24 41.6 140 110.4">${mark}</svg>
<svg x="176" y="0" width="435" height="154" viewBox="0 0 435 154">${wordmark}</svg>
</svg>`.replaceAll(/fill="(?!none)[^"]*"/g, `fill="${color}"`)

  return execFileSync('rsvg-convert', ['--height', String(HEIGHT_PX), '--format', 'png'], {
    input: svg,
  }).toString('base64')
}

writeFileSync(
  OUTPUT_PATH,
  `/**
 * GENERATED FILE - DO NOT EDIT
 *
 * Sanity mark and wordmark as base64 PNGs for terminals that support the kitty
 * graphics protocol. Sourced from https://svgl.app.
 *
 * Regenerate with: pnpm generate:logo-image
 */
export const logoImage = {
  onDarkBackground: '${render('#ffffff')}',
  onLightBackground: '${render('#0d0e12')}',
}
`,
)

console.log(`Wrote ${OUTPUT_PATH}`)
