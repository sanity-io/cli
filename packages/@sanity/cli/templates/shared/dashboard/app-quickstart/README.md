# Sanity App

A custom application built with the [Sanity App SDK](https://www.sanity.io/docs/app-sdk?utm_source=readme). It is a React app that runs inside your organization's Sanity Dashboard, in development and when deployed.

This app is set up for the Sanity Dashboard beta: `sanity.cli.ts` declares it with `defineApplication`.

## Commands

- `npm run dev` starts a local Sanity Dashboard (by default at http://localhost:3333, with the app on port 3334) and loads your app into it. Open it and sign in with your Sanity account.
- `npm run build` builds the app for production.
- `npm run deploy` deploys the app to your organization's Sanity Dashboard. The first deploy creates the app.

## Configuration

- `src/App.tsx` is the app entry point. The `SanityApp` config sets which project and dataset the app reads content from.
- `sanity.cli.ts` declares the app with `defineApplication`:
  - `title`: the app's name in the Dashboard.
  - `slug`: the app's unique address in your organization, used to create the app on its first deploy. Lowercase letters, numbers and hyphens, starting with a letter.
  - `organizationId`: the organization the app belongs to.
  - `entry`: the app entry path.

After the first deploy, add the app ID it prints to `sanity.cli.ts` as `deployment.appId` so later deploys update the same app.

## Learn more

- [App SDK Quickstart Guide](https://www.sanity.io/docs/app-sdk/sdk-quickstart?utm_source=readme)
- [App SDK documentation](https://www.sanity.io/docs/app-sdk?utm_source=readme)
- [API reference](https://reference.sanity.io/_sanity/sdk-react/)
- [Deploying your app](https://www.sanity.io/docs/app-sdk/sdk-deployment?utm_source=readme)
- [SDK Explorer with example apps](https://sdk-explorer.sanity.io)
