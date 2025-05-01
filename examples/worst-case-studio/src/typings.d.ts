/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SANITY_STUDIO_PREFIXED_VAR: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'https://themer.sanity.build/api/hues?*' {
  interface Hue extends Omit<import('@sanity/color').ColorHueConfig, 'midPoint' | 'title'> {
    midPoint: 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950
  }
  interface Hues {
    caution: Hue
    critical: Hue
    default: Hue
    positive: Hue
    primary: Hue
    transparent: Hue
  }
  export const hues: Hues
  type Theme = import('sanity').StudioTheme
  export function createTheme(_hues: Hues): Theme
  export const theme: Theme
}

declare module '*.module.css' {
  const classes: {[key: string]: string}
  export default classes
}

declare module '*.svg' {
  const path: string
  export default path
}
