import {existsSync} from 'node:fs'
import path from 'node:path'

import {type VersionedFramework} from '../types.js'
import {nextjsScaffold} from './nextjs.js'
import {type FrameworkScaffold} from './types.js'

const scaffoldsBySlug = new Map<string, FrameworkScaffold>([['nextjs', nextjsScaffold]])

const IN_PLACE_FRAMEWORKS = new Set(['astro', 'nextjs', 'nuxtjs', 'react-router', 'remix'])

export function getFrameworkScaffold(
  framework: VersionedFramework | null,
): FrameworkScaffold | undefined {
  return framework?.slug ? scaffoldsBySlug.get(framework.slug) : undefined
}

/**
 * Whether `init` adds a Studio to the current folder. Only the documented
 * frameworks qualify, and only when the folder has a `package.json` for the
 * Studio's packages and scripts. Everything else keeps the separate Studio flow.
 */
export function isInPlaceFramework(framework: VersionedFramework | null, workDir: string): boolean {
  if (!framework?.slug || !IN_PLACE_FRAMEWORKS.has(framework.slug)) return false

  return existsSync(path.join(workDir, 'package.json'))
}
