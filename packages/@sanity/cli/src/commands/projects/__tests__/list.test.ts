import {runCommand} from '@oclif/test'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test} from 'vitest'

import {PROJECTS_API_VERSION} from '../../../services/projects.js'
import {List} from '../list.js'

describe('#list', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['projects list', '--help'])

    expect(stdout).toContain('Lists projects connected to your user')
  })

  test('displays projects correctly', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: '/projects',
    }).reply(200, [
      {
        createdAt: '2023-01-01',
        displayName: 'Project One',
        id: 'project1',
        members: ['user1', 'user2'],
      },
      {
        createdAt: '2023-01-02',
        displayName: 'Project Two',
        id: 'project2',
        members: ['user1'],
      },
    ])

    const {stdout} = await testCommand(List)

    expect(stdout).toMatchSnapshot()
  })

  test('sorts by members when --sort members is specified', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: '/projects',
    }).reply(200, [
      {
        createdAt: '2023-01-01',
        displayName: 'Project One',
        id: 'project1',
        members: ['user1', 'user2', 'user3'],
      },
      {
        createdAt: '2023-01-02',
        displayName: 'Project Two',
        id: 'project2',
        members: ['user1'],
      },
      {
        createdAt: '2023-01-03',
        displayName: 'Project Three',
        id: 'project3',
        members: ['user1', 'user2'],
      },
    ])

    const {stdout} = await testCommand(List, ['--sort', 'members'])

    const lines = stdout.split('\n').filter(Boolean)

    // Find the indices of lines containing each project
    const project1Index = lines.findIndex((line) => line.includes('project1'))
    const project2Index = lines.findIndex((line) => line.includes('project2'))
    const project3Index = lines.findIndex((line) => line.includes('project3'))

    // Verify they all exist
    expect(project1Index).toBeGreaterThan(-1)
    expect(project2Index).toBeGreaterThan(-1)
    expect(project3Index).toBeGreaterThan(-1)

    // By default order is desc, so project with most members should come first
    expect(project1Index).toBeLessThan(project3Index)
    expect(project3Index).toBeLessThan(project2Index)
  })

  test('sorts in ascending order when --order asc is specified', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: '/projects',
    }).reply(200, [
      {
        createdAt: '2023-01-01',
        displayName: 'Project One',
        id: 'project1',
        members: ['user1', 'user2'],
      },
      {
        createdAt: '2023-01-02',
        displayName: 'Project Two',
        id: 'project2',
      },
      {
        createdAt: '2023-01-03',
        displayName: 'Project Three',
        id: 'project3',
        members: ['user1', 'user2', 'user3'],
      },
    ])

    const {stdout} = await testCommand(List, ['--order', 'asc'])

    const lines = stdout.split('\n').filter(Boolean)

    const line2023_01_01 = lines.findIndex((line) => line.includes('2023-01-01'))
    const line2023_01_02 = lines.findIndex((line) => line.includes('2023-01-02'))
    const line2023_01_03 = lines.findIndex((line) => line.includes('2023-01-03'))

    expect(line2023_01_01).toBeGreaterThan(0) // First line is header
    expect(line2023_01_02).toBeGreaterThan(0)
    expect(line2023_01_03).toBeGreaterThan(0)

    // Check the order (ascending)
    expect(line2023_01_01).toBeLessThan(line2023_01_02)
    expect(line2023_01_02).toBeLessThan(line2023_01_03)
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: '/projects',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(List)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list projects')
  })
})
