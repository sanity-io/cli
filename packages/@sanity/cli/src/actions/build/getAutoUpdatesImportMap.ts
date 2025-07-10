/**
 * @internal
 */
export interface StudioAutoUpdatesImportMap {
  '@sanity/vision': string
  '@sanity/vision/': string
  sanity: string
  'sanity/': string
}

export interface SanityAppAutoUpdatesImportMap extends Partial<StudioAutoUpdatesImportMap> {
  '@sanity/sdk': string
  '@sanity/sdk-react': string
  '@sanity/sdk-react/': string
  '@sanity/sdk/': string
}

const MODULES_HOST =
  process.env.SANITY_INTERNAL_ENV === 'staging'
    ? 'https://sanity-cdn.work'
    : 'https://sanity-cdn.com'

function getTimestamp(): string {
  return `t${Math.floor(Date.now() / 1000)}`
}

/**
 * @internal
 */
export function getStudioAutoUpdateImportMap(version: string): StudioAutoUpdatesImportMap {
  const timestamp = getTimestamp()

  const autoUpdatesImports = {
    '@sanity/vision': `${MODULES_HOST}/v1/modules/@sanity__vision/default/${version}/${timestamp}`,
    '@sanity/vision/': `${MODULES_HOST}/v1/modules/@sanity__vision/default/${version}/${timestamp}/`,
    sanity: `${MODULES_HOST}/v1/modules/sanity/default/${version}/${timestamp}`,
    'sanity/': `${MODULES_HOST}/v1/modules/sanity/default/${version}/${timestamp}/`,
  }

  return autoUpdatesImports
}

interface GetAppAutoUpdateImportMapOptions {
  sdkVersion: string

  sanityVersion?: string
}

/**
 * @internal
 */
export function getAppAutoUpdateImportMap(
  options: GetAppAutoUpdateImportMapOptions,
): SanityAppAutoUpdatesImportMap {
  const timestamp = getTimestamp()

  const {sanityVersion, sdkVersion} = options

  const autoUpdatesImports: SanityAppAutoUpdatesImportMap = {
    '@sanity/sdk': `${MODULES_HOST}/v1/modules/@sanity__sdk/default/${sdkVersion}/${timestamp}`,
    '@sanity/sdk-react': `${MODULES_HOST}/v1/modules/@sanity__sdk-react/default/${sdkVersion}/${timestamp}`,
    '@sanity/sdk-react/': `${MODULES_HOST}/v1/modules/@sanity__sdk-react/default/${sdkVersion}/${timestamp}/`,
    '@sanity/sdk/': `${MODULES_HOST}/v1/modules/@sanity__sdk/default/${sdkVersion}/${timestamp}/`,
  }

  if (sanityVersion) {
    const sanityImportMap = getStudioAutoUpdateImportMap(sanityVersion)

    return {...autoUpdatesImports, ...sanityImportMap}
  }

  return autoUpdatesImports
}
