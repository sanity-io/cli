import {
  resolveLocalPackage,
  resolveLocalPackageFrom,
  resolveLocalPackagePath,
} from '@sanity/cli-core'
import {type ComponentType, isValidElement, type ReactNode} from 'react'
import {isValidElementType} from 'react-is'

interface SchemaIconProps {
  title: string
  workDir: string

  icon?: ComponentType | ReactNode
  subtitle?: string
}

/**
 * Resolves all runtime dependencies from the studio's working directory and
 * returns a React element ready for synchronous server-side rendering.
 *
 * Dependencies like ThemeProvider and sanity components must share the same
 * React instance as the server renderer to avoid dual-React dispatcher issues,
 * so they are resolved from the studio's workDir rather than the CLI's own deps.
 *
 * @sanity/ui is a transitive dependency of sanity and may not be directly
 * accessible from the project root in strict package managers (pnpm, Yarn PnP).
 * We resolve it relative to the sanity package's location in node_modules.
 *
 * This function is async, but the returned element is a plain synchronous
 * component - no async server components required. This keeps compatibility
 * with both React 18 and React 19.
 */
async function resolveSchemaIcon({
  icon,
  subtitle = '',
  title,
  workDir,
}: SchemaIconProps): Promise<React.JSX.Element> {
  // Resolve @sanity/ui via sanity's location, since it's a transitive dep
  // that may not be directly accessible from the project root (pnpm strict mode)
  const sanityUrl = resolveLocalPackagePath('sanity', workDir)
  const [{ThemeProvider}, {buildTheme}, normalizedIcon] = await Promise.all([
    resolveLocalPackageFrom<typeof import('@sanity/ui')>('@sanity/ui', sanityUrl),
    resolveLocalPackageFrom<typeof import('@sanity/ui/theme')>('@sanity/ui/theme', sanityUrl),
    normalizeIcon(icon, title, subtitle, workDir),
  ])
  const theme = buildTheme()

  return <ThemeProvider theme={theme}>{normalizedIcon}</ThemeProvider>
}

async function normalizeIcon(
  Icon: ComponentType | ReactNode | undefined,
  title: string,
  subtitle: string,
  workDir: string,
): Promise<React.JSX.Element> {
  if (isValidElementType(Icon)) return <Icon />
  if (isValidElement(Icon)) return Icon

  const {createDefaultIcon} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  return createDefaultIcon(title, subtitle)
}

export {resolveSchemaIcon}
export type {SchemaIconProps}
