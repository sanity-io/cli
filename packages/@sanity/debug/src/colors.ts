/**
 * Basic 16-color ANSI palette (same as original debug).
 * Used when terminal supports only 16 colors.
 * @internal
 */
export const ANSI_COLORS_BASIC: ReadonlyArray<number> = [6, 2, 3, 4, 5, 1]

/**
 * Extended 256-color ANSI palette (same as original debug with supports-color level 2+).
 * Used when terminal supports 256+ colors.
 * @internal
 */
export const ANSI_COLORS_EXTENDED: ReadonlyArray<number> = [
  20, 21, 26, 27, 32, 33, 38, 39, 40, 41, 42, 43, 44, 45, 56, 57, 62, 63, 68, 69, 74, 75, 76, 77,
  78, 79, 80, 81, 92, 93, 98, 99, 112, 113, 128, 129, 134, 135, 148, 149, 160, 161, 162, 163, 164,
  165, 166, 167, 168, 169, 170, 171, 172, 173, 178, 179, 184, 185, 196, 197, 198, 199, 200, 201,
  202, 203, 204, 205, 206, 207, 208, 209, 214, 215, 220, 221,
]

/**
 * CSS hex color palette for browser console output.
 * Same palette as original debug browser implementation.
 * @internal
 */
export const CSS_COLORS: ReadonlyArray<string> = [
  '#0000CC',
  '#0000FF',
  '#0033CC',
  '#0033FF',
  '#0066CC',
  '#0066FF',
  '#0099CC',
  '#0099FF',
  '#00CC00',
  '#00CC33',
  '#00CC66',
  '#00CC99',
  '#00CCCC',
  '#00CCFF',
  '#3300CC',
  '#3300FF',
  '#3333CC',
  '#3333FF',
  '#3366CC',
  '#3366FF',
  '#3399CC',
  '#3399FF',
  '#33CC00',
  '#33CC33',
  '#33CC66',
  '#33CC99',
  '#33CCCC',
  '#33CCFF',
  '#6600CC',
  '#6600FF',
  '#6633CC',
  '#6633FF',
  '#66CC00',
  '#66CC33',
  '#9900CC',
  '#9900FF',
  '#9933CC',
  '#9933FF',
  '#99CC00',
  '#99CC33',
  '#CC0000',
  '#CC0033',
  '#CC0066',
  '#CC0099',
  '#CC00CC',
  '#CC00FF',
  '#CC3300',
  '#CC3333',
  '#CC3366',
  '#CC3399',
  '#CC33CC',
  '#CC33FF',
  '#CC6600',
  '#CC6633',
  '#CC9900',
  '#CC9933',
  '#CCCC00',
  '#CCCC33',
  '#FF0000',
  '#FF0033',
  '#FF0066',
  '#FF0099',
  '#FF00CC',
  '#FF00FF',
  '#FF3300',
  '#FF3333',
  '#FF3366',
  '#FF3399',
  '#FF33CC',
  '#FF33FF',
  '#FF6600',
  '#FF6633',
  '#FF9900',
  '#FF9933',
  '#FFCC00',
  '#FFCC33',
]

/**
 * Select a deterministic color for a namespace using DJB2 hash.
 * Same algorithm as original debug - same namespace always gets same color.
 * @internal
 */
export function selectColor(
  namespace: string,
  colors: ReadonlyArray<number | string>,
): number | string {
  let hash = 0
  for (let i = 0; i < namespace.length; i++) {
    hash = (hash << 5) - hash + (namespace.codePointAt(i) ?? 0)
    hash = Math.trunc(hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
