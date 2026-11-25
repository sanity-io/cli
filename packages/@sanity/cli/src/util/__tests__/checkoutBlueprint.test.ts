import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {runWithCliExecutionContext} from '@sanity/cli-core/executionContext'
import {expect, test} from 'vitest'

import {getCheckoutBlueprint} from '../checkoutBlueprint.js'

function checkoutFixture() {
  const root = mkdtempSync(join(tmpdir(), 'cli-checkout-blueprint-'))
  mkdirSync(join(root, '.git'))
  return root
}

function writeStackLink(dir: string, link: Record<string, string>) {
  mkdirSync(join(dir, '.sanity'), {recursive: true})
  writeFileSync(join(dir, '.sanity', 'blueprint.config.json'), JSON.stringify(link))
}

test('uses the nearest link from a nested working directory without evaluating the Blueprint', () => {
  const root = checkoutFixture()
  try {
    const sub = join(root, 'sub')
    const cwd = join(sub, 'src')
    mkdirSync(cwd, {recursive: true})
    writeStackLink(root, {projectId: 'outer-project', stackId: 'ST-outer'})
    writeStackLink(sub, {organizationId: 'inner-org', stackId: 'ST-inner'})
    writeFileSync(join(sub, 'sanity.blueprint.ts'), 'throw new Error("do not run")')

    expect(getCheckoutBlueprint(cwd)).toEqual({
      directory: sub,
      scopeId: 'inner-org',
      scopeType: 'organization',
      stackId: 'ST-inner',
    })
  } finally {
    rmSync(root, {force: true, recursive: true})
  }
})

test.each(['.git', 'sanity.blueprint.ts', '.sanity/blueprint.config.json'])(
  'does not inherit a parent Stack across a %s boundary',
  (boundary) => {
    const root = checkoutFixture()
    try {
      const sub = join(root, 'sub')
      mkdirSync(sub)
      writeStackLink(root, {projectId: 'outer-project', stackId: 'ST-outer'})
      if (boundary.startsWith('.sanity/')) mkdirSync(join(sub, '.sanity'))
      writeFileSync(join(sub, boundary), '{}')

      expect(getCheckoutBlueprint(sub)).toBeUndefined()
    } finally {
      rmSync(root, {force: true, recursive: true})
    }
  },
)

test('ignores the host filesystem in an embedded invocation', () => {
  const root = checkoutFixture()
  try {
    writeStackLink(root, {projectId: 'project', stackId: 'ST-local'})
    expect(getCheckoutBlueprint(root)).toEqual({
      directory: root,
      scopeId: 'project',
      scopeType: 'project',
      stackId: 'ST-local',
    })
    expect(runWithCliExecutionContext({}, () => getCheckoutBlueprint(root))).toBeUndefined()
  } finally {
    rmSync(root, {force: true, recursive: true})
  }
})
