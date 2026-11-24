import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, expect, test} from 'vitest'

import {definePanelView, defineWindowView} from '../contract.js'
import {defineApplication} from '../defineApp.js'
import {readAppIcon, readViewIcons} from '../readAppIcon.js'

let workDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'app-icon-'))
})

afterEach(async () => {
  await rm(workDir, {force: true, recursive: true})
})

test('reads the image at a path relative to the project root', async () => {
  await mkdir(join(workDir, 'public'))
  await writeFile(join(workDir, 'public', 'icon.png'), 'png bytes')

  expect(await readAppIcon(workDir, './public/icon.png')).toEqual({
    contentType: 'image/png',
    file: join(workDir, 'public', 'icon.png'),
    image: Buffer.from('png bytes'),
  })
})

test('rejects a path outside the project directory', async () => {
  await expect(readAppIcon(workDir, '../icon.png')).rejects.toThrow(
    'Icon "../icon.png" is outside the project directory. Move the image into the project and update the icon path in sanity.cli.ts.',
  )
})

test('names the icon path when the image cannot be used', async () => {
  await expect(readAppIcon(workDir, './icon.psd')).rejects.toThrow(
    `Can't use icon "./icon.psd": "${join(workDir, 'icon.psd')}" isn't a supported image type.`,
  )
})

test('reads window and panel view icons, keyed by their Brett interface type and name', async () => {
  await writeFile(join(workDir, 'inbox.png'), 'png bytes')
  await writeFile(join(workDir, 'feed.png'), 'png bytes')
  const app = defineApplication({
    organizationId: 'org-1',
    slug: 'drop-desk',
    title: 'Drop Desk',
    views: [
      defineWindowView({
        icon: './inbox.png',
        name: 'inbox',
        src: './src/Inbox.tsx',
        title: 'Inbox',
      }),
      definePanelView({icon: './feed.png', name: 'feed', src: './src/Feed.tsx', title: 'Feed'}),
      definePanelView({name: 'plain', src: './src/Plain.tsx', title: 'Plain'}),
    ],
  }) as CliConfig['app']

  expect(
    (await readViewIcons(workDir, app)).map(({icon, name, type}) => ({
      file: icon.file,
      name,
      type,
    })),
  ).toEqual([
    {file: join(workDir, 'inbox.png'), name: 'inbox', type: 'app'},
    {file: join(workDir, 'feed.png'), name: 'feed', type: 'panel'},
  ])
})
