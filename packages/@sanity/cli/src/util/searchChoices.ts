import {styleText} from 'node:util'

import {Separator} from '@sanity/cli-core/ux'

type Choice = {disabled?: boolean | string; name: string; value: string}

/** `search` prompt theme that adds a "type to search" hint to the key help line. */
export const searchTheme = {
  style: {
    keysHelpTip: (keys: [key: string, action: string][]) =>
      [['type', 'to search'], ...keys]
        .map(([key, action]) => `${styleText('bold', key)} ${styleText('dim', action)}`)
        .join(styleText('dim', ' • ')),
  },
}

const isChoice = (choice: Choice | Separator): choice is Choice => !Separator.isSeparator(choice)

/**
 * Builds a `search` prompt source that keeps choices whose `name` contains every search word.
 * Actions above the first separator (e.g. "Create new ...") stay visible, below the matches while
 * searching so that Enter picks the top match. Without a selectable match the actions are
 * disabled, so Enter does nothing.
 */
export function searchChoices(choices: Array<Choice | Separator>) {
  const separatorIndex = choices.findIndex((choice) => Separator.isSeparator(choice))
  const actions = choices.slice(0, Math.max(separatorIndex, 0)).filter((choice) => isChoice(choice))
  const searchable = choices.slice(separatorIndex + 1).filter((choice) => isChoice(choice))

  return (term: string | undefined) => {
    const trimmed = term?.trim() ?? ''

    if (!trimmed) {
      return choices
    }

    const words = trimmed.toLowerCase().split(/\s+/)
    const matches = searchable.filter((choice) =>
      words.every((word) => choice.name.toLowerCase().includes(word)),
    )

    if (actions.length === 0) {
      return matches
    }

    if (matches.some((choice) => !choice.disabled)) {
      return [...matches, new Separator(), ...actions]
    }

    return [
      ...matches,
      new Separator(matches.length > 0 ? undefined : `No matches for "${trimmed}"`),
      ...actions.map((action) => ({...action, disabled: '(clear search to select)'})),
    ]
  }
}
