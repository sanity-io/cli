// e2e probe: the CLI stamps the app's bus identity into served/bundled modules
// as `__SANITY_APP_ID__`; the workbench dev e2e fetches this module and asserts
// the define was applied.
declare const __SANITY_APP_ID__: string | undefined
export const appId = typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : 'unset'
