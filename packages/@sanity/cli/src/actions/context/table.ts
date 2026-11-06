import {Table} from '../../util/responsiveTable.js'

type TableOptions = ConstructorParameters<typeof Table>[0]

/**
 * A table that leaves out colours when stdout can't show them: when it is a
 * pipe or a file, or `NO_COLOR` is set
 */
export function contextTable(options: TableOptions): Table {
  const hasColors = Boolean(process.stdout.isTTY) && process.stdout.hasColors()
  return new Table({shouldDisableColors: !hasColors, ...options})
}
