/**
 * Test fixtures for the `/installations` boundary.
 *
 * The shape mirrors a real `/installations` list item (see the sample below).
 * `resolveSingletonInstallationId` only reads `id` and `application.name`, but
 * the fixture stays faithful to the whole response on purpose: the real
 * `application` carries BOTH `slug` ("media") and `name` ("media-library") with
 * *different* values, so code that matches on the wrong field still finds a
 * field — it just reads the wrong value. Modelling both, with their real
 * differing values, is what catches that confusion (the `slug`→`name` bug).
 *
 * Keeping the shape here means it lives in one place: when it's wrong, it's
 * wrong for every consumer at once, so a mismatch with the real API surfaces as
 * a failing test instead of stubs that quietly agree with each other.
 */

/** A representative Sanity app icon; the API returns the full inline SVG string. */
const APP_ICON =
  '<svg data-sanity-icon="apps-media" width="1em" height="1em" viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 6.5H19.5V8.5H11.5L10.5 6.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'

/** The `application` record embedded in an installation. */
export interface InstallationApplication {
  icon: string
  name: string
  organizationId: string
  reference: string
  slug: string
  title: string
}

/** One installation, as returned inside the `/installations` envelope. */
export interface Installation {
  application: InstallationApplication
  applicationId: string
  createdAt: string
  id: string
  installedBy: string | null
  organizationId: string
  updatedAt: string
}

/**
 * Build one installation list item. Defaults are real values from a live
 * `/installations` response. `name` is a shortcut for `application.name` (the
 * field the resolver matches on); override `application` for any other sub-field.
 */
export function anInstallation(
  overrides: {
    application?: Partial<InstallationApplication>
    applicationId?: string
    createdAt?: string
    id?: string
    installedBy?: string | null
    name?: string
    organizationId?: string
    updatedAt?: string
  } = {},
): Installation {
  const {application, name = 'media-library', ...rest} = overrides
  return {
    applicationId: 'abr50vkenfbehpb6scx3w5gg',
    createdAt: '2026-07-21T07:24:08.511Z',
    id: 'pwhce8q7tw8uz2ig2gdhkwp6',
    installedBy: null,
    organizationId: 'oF5P8QpKU',
    updatedAt: '2026-07-21T07:24:08.511Z',
    ...rest,
    application: {
      icon: APP_ICON,
      name,
      organizationId: 'oF5P8QpKU',
      reference: 'sanity/media-library',
      slug: 'media',
      title: 'Media Library',
      ...application,
    },
  }
}

/** The `{data: [...]}` envelope the `/installations` endpoint actually returns. */
export function installationsResponse(items: Installation[]): {data: Installation[]} {
  return {data: items}
}
