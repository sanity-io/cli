import {describe, expect, test} from 'vitest'

import {buildInstallationConfigDeploymentPayload} from '../installationConfigDeployment.js'

describe('buildInstallationConfigDeploymentPayload', () => {
  test('builds a payload from the declared installation config', () => {
    const payload = buildInstallationConfigDeploymentPayload({
      applicationId: 'app-1',
      installationConfig: {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        ],
      },
    })
    expect(payload).toEqual({
      applicationId: 'app-1',
      installationConfig: {
        appType: 'media-library',
        fields: [
          {name: 'description', public: true, src: './src/description.ts', title: 'Description'},
        ],
      },
    })
  })

  test('passes through extra field attributes (loose object)', () => {
    const payload = buildInstallationConfigDeploymentPayload({
      applicationId: 'app-1',
      installationConfig: {
        appType: 'media-library',
        fields: [
          {group: 'meta', name: 'description', src: './src/description.ts', title: 'Description'},
        ],
      },
    })
    expect(payload.installationConfig.fields[0]).toMatchObject({group: 'meta', name: 'description'})
  })

  test('throws on an unknown appType', () => {
    expect(() =>
      buildInstallationConfigDeploymentPayload({
        applicationId: 'app-1',
        installationConfig: {
          appType: 'studio',
          fields: [{name: 'description', src: './src/description.ts', title: 'Description'}],
        },
      }),
    ).toThrow()
  })

  test('throws on an illegal field name', () => {
    expect(() =>
      buildInstallationConfigDeploymentPayload({
        applicationId: 'app-1',
        installationConfig: {
          appType: 'media-library',
          fields: [{name: 'not a name!', src: './src/x.ts', title: 'X'}],
        },
      }),
    ).toThrow(/must match/)
  })

  test('throws when a required field attribute is missing', () => {
    expect(() =>
      buildInstallationConfigDeploymentPayload({
        applicationId: 'app-1',
        installationConfig: {
          appType: 'media-library',
          fields: [{name: 'description', src: './src/description.ts'}],
        },
      }),
    ).toThrow()
  })
})
