import {resolveLocalPackage} from '@sanity/cli-core'
import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {type ComponentType, isValidElement, type ReactNode} from 'react'
import {isValidElementType} from 'react-is'

const theme = buildTheme()

interface SchemaIconProps {
  title: string
  workDir: string

  icon?: ComponentType | ReactNode
  subtitle?: string
}

const SchemaIcon = async ({
  icon,
  subtitle,
  title,
  workDir,
}: SchemaIconProps): Promise<React.JSX.Element> => {
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
