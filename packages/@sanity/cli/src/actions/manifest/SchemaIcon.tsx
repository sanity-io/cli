import {resolveLocalPackage} from '@sanity/cli-core'
import {type ComponentType, isValidElement, type ReactNode} from 'react'
import {isValidElementType} from 'react-is'

interface SchemaIconProps {
  title: string
  workDir: string

  icon?: ComponentType | ReactNode
  subtitle?: string
}

/**
 * All runtime dependencies that use React hooks (ThemeProvider, sanity components)
 * must be resolved from the studio's working directory. This ensures they share
 * the same React instance as the server renderer, avoiding dual-React dispatcher issues.
 */
const SchemaIcon = async ({
  icon,
  subtitle,
  title,
  workDir,
}: SchemaIconProps): Promise<React.JSX.Element> => {
  const [{ThemeProvider}, {buildTheme}] = await Promise.all([
    resolveLocalPackage<typeof import('@sanity/ui')>('@sanity/ui', workDir),
    resolveLocalPackage<typeof import('@sanity/ui/theme')>('@sanity/ui/theme', workDir),
  ])
  const theme = buildTheme()
  const normalizedIcon = await normalizeIcon(icon, title, subtitle, workDir)

  return <ThemeProvider theme={theme}>{normalizedIcon}</ThemeProvider>
}

async function normalizeIcon(
  Icon: ComponentType | ReactNode | undefined,
  title: string,
  subtitle = '',
  workDir: string,
): Promise<React.JSX.Element> {
  if (isValidElementType(Icon)) return <Icon />
  if (isValidElement(Icon)) return Icon

  const {createDefaultIcon} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  return createDefaultIcon(title, subtitle)
}

export {SchemaIcon}
export type {SchemaIconProps}
