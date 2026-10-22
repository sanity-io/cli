import {type VendorBuildConfig} from './resolveVendorBuildConfig.js'

/**
 * Everything the production build needs to produce an auto-updating studio/app.
 *
 * Auto-updating deployments load `sanity` (and friends) from Sanity's module
 * CDN via an import map, and load `react`/`react-dom`/`styled-components` from
 * hashed vendor chunks emitted by the build itself.
 *
 * @internal
 */
export interface AutoUpdatesBuildConfig {
  /** Import map entries for the packages served from Sanity's module CDN. */
  imports: Record<string, string>
  /** Vendor packages to emit as hashed browser-loadable ESM chunks. */
  vendor: VendorBuildConfig

  /** Stylesheets served from the module CDN, loaded via `<link>` tags. */
  cssUrls?: string[]
}

export interface ModuleCdnPlan {
  packages: {cssUrl?: string; name: string; url: string}[]
}
