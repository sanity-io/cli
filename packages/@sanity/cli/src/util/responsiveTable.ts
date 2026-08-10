import {Table as ConsoleTable} from 'console-table-printer'
import stringWidth from 'string-width'
import wrapAnsi from 'wrap-ansi'

type ConsoleTableOptions = Exclude<
  ConstructorParameters<typeof ConsoleTable>[0],
  string[] | undefined
>
type ConsoleTableRow = Parameters<ConsoleTable['addRow']>[0]
type ConsoleTableRowOptions = Parameters<ConsoleTable['addRow']>[1]

type StoredRow = {
  cells: ConsoleTableRow
  options?: ConsoleTableRowOptions
}

const cellPaddingWidth = 2
const borderCharacterWidth = 1

function cellText(value: ConsoleTableRow[string]): string {
  return value === undefined || value === null ? '' : String(value)
}

function maxLineWidth(value: string): number {
  return Math.max(...value.split('\n').map((line) => stringWidth(line)))
}

export class Table {
  readonly #options: ConsoleTableOptions
  readonly #rows: StoredRow[] = []

  constructor(options: ConsoleTableOptions) {
    this.#options = options
  }

  addRow(cells: ConsoleTableRow, options?: ConsoleTableRowOptions): this {
    this.#rows.push({cells, options})
    return this
  }

  addRows(rows: ConsoleTableRow[], options?: ConsoleTableRowOptions): this {
    for (const row of rows) this.addRow(row, options)
    return this
  }

  render(): string {
    const columns = this.#options.columns ?? []
    const columnTitles = columns.map(({name, title = name}) => title)
    const minimumColumnWidths = columns.map(({minLen = 1}) => Math.max(minLen, 1))
    const columnWidths = columns.map(({name}, index) =>
      Math.max(
        stringWidth(columnTitles[index]),
        ...this.#rows.map(({cells}) => maxLineWidth(cellText(cells[name]))),
      ),
    )
    const borderWidth =
      borderCharacterWidth + columns.length * (cellPaddingWidth + borderCharacterWidth)
    const minimumContentWidth = minimumColumnWidths.reduce((total, width) => total + width, 0)
    const availableContentWidth = Math.max(
      (process.stdout.columns || Infinity) - borderWidth,
      minimumContentWidth,
    )

    let excessWidth =
      columnWidths.reduce((total, width) => total + width, 0) - availableContentWidth
    while (excessWidth > 0) {
      const widestColumnIndex = columnWidths
        .map((width, index) => ({index, width: width - minimumColumnWidths[index]}))
        .toSorted((left, right) => right.width - left.width)[0].index
      columnWidths[widestColumnIndex] -= 1
      excessWidth -= 1
    }

    const tableWidth = borderWidth + columnWidths.reduce((total, width) => total + width, 0)
    const renderTable = (title?: string) => {
      const table = new ConsoleTable({
        rowSeparator: true,
        ...this.#options,
        columns: columns.map((column, index) => ({
          ...column,
          maxLen: columnWidths[index],
          title: wrapAnsi(columnTitles[index], columnWidths[index], {hard: true}),
        })),
        title,
      })

      for (const {cells, options} of this.#rows) {
        const wrappedCells = {...cells}
        for (const [index, {name}] of columns.entries()) {
          wrappedCells[name] = wrapAnsi(cellText(cells[name]), columnWidths[index], {hard: true})
        }
        table.addRow(wrappedCells, options)
      }

      return table.render()
    }

    const renderedTable = renderTable()
    if (!this.#options.title) return renderedTable

    const renderedWithTitle = renderTable(this.#options.title)
    const tableSuffix = `\n${renderedTable}`
    const renderedTitle = renderedWithTitle.slice(0, -tableSuffix.length)
    const wrappedTitle = wrapAnsi(renderedTitle, tableWidth, {hard: true, trim: false})
    return `${wrappedTitle}${tableSuffix}`
  }
}
