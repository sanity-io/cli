import {existsSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'

import {BLUEPRINT_FILE_NAMES, readStackConfigFile, type ScopeType} from '@sanity/blueprints/resolve'
import {getCliExecutionContext} from '@sanity/cli-core/executionContext'

export interface CheckoutStack {
  scopeId: string
  scopeType: ScopeType
  stackId: string
}

export function getCheckoutBlueprint(cwd = process.cwd()): CheckoutStack | undefined {
  if (getCliExecutionContext()) return

  let directory = resolve(cwd)
  while (true) {
    const link = readStackConfigFile(directory)
    if (link?.stackId && link.projectId) {
      return {scopeId: link.projectId, scopeType: 'project', stackId: link.stackId}
    }
    if (link?.stackId && link.organizationId) {
      return {scopeId: link.organizationId, scopeType: 'organization', stackId: link.stackId}
    }

    const parent = dirname(directory)
    // An unlinked Blueprint or nested checkout must not inherit a parent's Stack.
    if (
      link ||
      directory === parent ||
      existsSync(join(directory, '.git')) ||
      BLUEPRINT_FILE_NAMES.some((name) => existsSync(join(directory, name)))
    ) {
      return
    }
    directory = parent
  }
}
