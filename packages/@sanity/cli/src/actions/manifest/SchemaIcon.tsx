import {ThemeProvider} from '@sanity/ui'
import {buildTheme} from '@sanity/ui/theme'
import {Component, type ComponentType, isValidElement, type ReactNode} from 'react'
import {isValidElementType} from 'react-is'
import {createDefaultIcon} from 'sanity'

const theme = buildTheme()

interface SchemaIconProps {
  title: string

  icon?: Component | ComponentType | ReactNode
  subtitle?: string
}

const SchemaIcon = ({icon, subtitle, title}: SchemaIconProps): React.JSX.Element => {
  return <ThemeProvider theme={theme}>{normalizeIcon(title, icon, subtitle)}</ThemeProvider>
}

function normalizeIcon(
  title: string,
  Icon?: SchemaIconProps['icon'],
  subtitle = '',
): React.JSX.Element {
  Icon = Icon instanceof Component ? Icon.render() : Icon

  if (isValidElementType(Icon)) return <Icon />
  if (isValidElement(Icon)) return Icon
  return createDefaultIcon(title, subtitle)
}

export {SchemaIcon}
export type {SchemaIconProps}
