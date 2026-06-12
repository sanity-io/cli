# Sanity App

A custom application built with the [Sanity App SDK](https://www.sanity.io/docs/app-sdk?utm_source=readme). It is a React app that runs inside your organization's Sanity Dashboard, in development and when deployed.

## Commands

- `npm run dev` starts the dev server and prints a Sanity Dashboard URL where your app runs. Open it and sign in with your Sanity account.
- `npm run build` builds the app for production.
- `npm run deploy` deploys the app to the Sanity Dashboard.

## Configuration

- `src/App.tsx` is the app entry point. The `SanityApp` config sets which project and dataset the app reads content from.
- `sanity.cli.ts` holds your organization ID and the app entry path.

## Learn more

- [App SDK Quickstart Guide](https://www.sanity.io/docs/app-sdk/sdk-quickstart?utm_source=readme)
- [App SDK documentation](https://www.sanity.io/docs/app-sdk?utm_source=readme)
- [API reference](https://reference.sanity.io/_sanity/sdk-react/)
- [Deploying your app](https://www.sanity.io/docs/app-sdk/sdk-deployment?utm_source=readme)
- [SDK Explorer with example apps](https://sdk-explorer.sanity.io)
