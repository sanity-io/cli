# @sanity/cli-test

Provides test helpers for the Sanity CLI.

## API

### `testCommand(command: Command, args?: string[])`

Runs the given command with the given arguments and returns the output.

```ts
const {stdout} = await testCommand(DevCommand, ['--host', '0.0.0.0', '--port', '3000'])
```

### `mockApi(api: ApiClient)`

Mocks the sanity/client calls.

```ts
mockApi({
  apiVersion: '2024-01-17',
  method: 'get',
  uri: '/users/me',
  query: {
    recordType: 'user',
  },
}).reply(200, {
  id: 'user-id',
  name: 'John Doe',
  email: 'john.doe@example.com',
})
```
