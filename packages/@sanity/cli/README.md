# @sanity/cli

Code for sanity cli

# Usage

  <!-- usage -->

```sh-session
$ npm install -g @sanity/cli
$ sanity COMMAND
running command...
$ sanity (--version)
@sanity/cli/0.0.0 darwin-arm64 node-v20.19.1
$ sanity --help [COMMAND]
USAGE
  $ sanity COMMAND
...
```

<!-- usagestop -->

# Commands

  <!-- commands -->

- [`sanity build [OUTPUTDIR]`](#sanity-build-outputdir)
- [`sanity dev`](#sanity-dev)
- [`sanity docs`](#sanity-docs)
- [`sanity help [COMMAND]`](#sanity-help-command)
- [`sanity learn`](#sanity-learn)
- [`sanity login`](#sanity-login)
- [`sanity logout`](#sanity-logout)
- [`sanity manage`](#sanity-manage)
- [`sanity versions`](#sanity-versions)

## `sanity build [OUTPUTDIR]`

Builds the Sanity Studio configuration into a static bundle

```
USAGE
  $ sanity build [OUTPUTDIR] [--auto-updates] [--minify] [--source-maps] [-y]

ARGUMENTS
  OUTPUTDIR  [default: dist] Output directory

FLAGS
  -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults
      --[no-]auto-updates  Enable/disable auto updates of studio versions
      --[no-]minify        Enable/disable minifying of built bundles
      --[no-]source-maps   Enable source maps for built bundles (increases size of bundle)

DESCRIPTION
  Builds the Sanity Studio configuration into a static bundle

EXAMPLES
  $ sanity build

  $ sanity build --no-minify

  $ sanity build --source-maps
```

_See code: [src/commands/build.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/build.ts)_

## `sanity dev`

Starts a local development server for Sanity Studio with live reloading

```
USAGE
  $ sanity dev [--host <value>] [--port <value>]

FLAGS
  --host=<value>  [default: 127.0.0.1] The local network interface at which to listen
  --port=<value>  [default: 3333] TCP port to start server on

DESCRIPTION
  Starts a local development server for Sanity Studio with live reloading

EXAMPLES
  $ sanity dev --host=0.0.0.0

  $ sanity dev --port=1942
```

_See code: [src/commands/dev.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/dev.ts)_

## `sanity docs`

Opens Sanity Studio documentation in your web browser

```
USAGE
  $ sanity docs

DESCRIPTION
  Opens Sanity Studio documentation in your web browser
```

_See code: [src/commands/docs.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/docs.ts)_

## `sanity help [COMMAND]`

Display help for sanity.

```
USAGE
  $ sanity help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for sanity.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.28/src/commands/help.ts)_

## `sanity learn`

Opens Sanity Learn in your web browser

```
USAGE
  $ sanity learn

DESCRIPTION
  Opens Sanity Learn in your web browser
```

_See code: [src/commands/learn.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/learn.ts)_

## `sanity login`

Authenticates the CLI for access to Sanity projects

```
USAGE
  $ sanity login [--open] [--provider <providerId>] [--sso <slug>]

FLAGS
  --[no-]open              Open a browser window to log in (`--no-open` only prints URL)
  --provider=<providerId>  Log in using the given provider
  --sso=<slug>             Log in using Single Sign-On, using the given organization slug

DESCRIPTION
  Authenticates the CLI for access to Sanity projects

EXAMPLES
  Log in using default settings

    $ sanity login

  Log in using Single Sign-On with the "my-organization" slug

    $ sanity login --sso my-organization

  Login with GitHub provider, but do not open a browser window automatically

    $ sanity login --provider github --no-open
```

_See code: [src/commands/login.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/login.ts)_

## `sanity logout`

Logs out the CLI from the current user session

```
USAGE
  $ sanity logout

DESCRIPTION
  Logs out the CLI from the current user session
```

_See code: [src/commands/logout.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/logout.ts)_

## `sanity manage`

Opens project management interface in your web browser

```
USAGE
  $ sanity manage

DESCRIPTION
  Opens project management interface in your web browser
```

_See code: [src/commands/manage.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/manage.ts)_

## `sanity versions`

Shows installed versions of Sanity Studio and components

```
USAGE
  $ sanity versions

DESCRIPTION
  Shows installed versions of Sanity Studio and components

EXAMPLES
  $ sanity versions
```

_See code: [src/commands/versions.ts](https://github.com/sanity-io/cli/blob/v0.0.0/src/commands/versions.ts)_

<!-- commandsstop -->

# Table of contents

  <!-- toc -->

- [@sanity/cli](#sanitycli)
- [Usage](#usage)
- [Commands](#commands)
- [Table of contents](#table-of-contents)
<!-- tocstop -->
