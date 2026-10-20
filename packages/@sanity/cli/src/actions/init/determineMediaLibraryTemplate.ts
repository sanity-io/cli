const mediaLibraryTemplates = new Set(['media-library-config'])

/**
 * Media Library config templates follow the app init flow (organization-only,
 * no project/dataset) but scaffold an `unstable_defineMediaLibrary` config
 * instead of `defineApplication`. Kept out of `determineAppTemplate`'s set so
 * the app-template-specific bootstrap branches (`src/App.tsx` processing, the
 * SDK dependency base, the dashboard docs overlay) don't apply.
 */
export function determineMediaLibraryTemplate(templateName: string): boolean {
  return mediaLibraryTemplates.has(templateName)
}
