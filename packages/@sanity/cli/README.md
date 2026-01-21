# @sanity/cli

Code for sanity cli

<!-- toc -->

- [@sanity/cli](#sanitycli)
- [Usage](#usage)
- [Commands](#commands)
<!-- tocstop -->

# Usage

  <!-- usage -->

```sh-session
$ npm install -g @sanity/cli
$ sanity COMMAND
running command...
$ sanity (--version)
@sanity/cli/6.0.0-alpha.7 darwin-arm64 node-v24.13.0
$ sanity --help [COMMAND]
USAGE
  $ sanity COMMAND
...
```

<!-- usagestop -->

# Commands

  <!-- commands -->

- [`sanity backup disable [DATASET]`](#sanity-backup-disable-dataset)
- [`sanity backup download [DATASET]`](#sanity-backup-download-dataset)
- [`sanity backup enable [DATASET]`](#sanity-backup-enable-dataset)
- [`sanity backup list [DATASET]`](#sanity-backup-list-dataset)
- [`sanity blueprints add TYPE`](#sanity-blueprints-add-type)
- [`sanity blueprints config`](#sanity-blueprints-config)
- [`sanity blueprints deploy`](#sanity-blueprints-deploy)
- [`sanity blueprints destroy`](#sanity-blueprints-destroy)
- [`sanity blueprints doctor`](#sanity-blueprints-doctor)
- [`sanity blueprints info`](#sanity-blueprints-info)
- [`sanity blueprints init [DIR]`](#sanity-blueprints-init-dir)
- [`sanity blueprints logs`](#sanity-blueprints-logs)
- [`sanity blueprints plan`](#sanity-blueprints-plan)
- [`sanity blueprints stacks`](#sanity-blueprints-stacks)
- [`sanity build [OUTPUTDIR]`](#sanity-build-outputdir)
- [`sanity codemod [CODEMODNAME]`](#sanity-codemod-codemodname)
- [`sanity cors add ORIGIN`](#sanity-cors-add-origin)
- [`sanity cors delete [ORIGIN]`](#sanity-cors-delete-origin)
- [`sanity cors list`](#sanity-cors-list)
- [`sanity dataset alias create [ALIASNAME] [TARGETDATASET]`](#sanity-dataset-alias-create-aliasname-targetdataset)
- [`sanity dataset alias delete ALIASNAME`](#sanity-dataset-alias-delete-aliasname)
- [`sanity dataset alias link [ALIASNAME] [TARGETDATASET]`](#sanity-dataset-alias-link-aliasname-targetdataset)
- [`sanity dataset alias unlink [ALIASNAME]`](#sanity-dataset-alias-unlink-aliasname)
- [`sanity dataset copy [SOURCE] [TARGET]`](#sanity-dataset-copy-source-target)
- [`sanity dataset create [NAME]`](#sanity-dataset-create-name)
- [`sanity dataset delete DATASETNAME`](#sanity-dataset-delete-datasetname)
- [`sanity dataset export [NAME] [DESTINATION]`](#sanity-dataset-export-name-destination)
- [`sanity dataset import SOURCE`](#sanity-dataset-import-source)
- [`sanity dataset list`](#sanity-dataset-list)
- [`sanity dataset visibility get DATASET`](#sanity-dataset-visibility-get-dataset)
- [`sanity dataset visibility set DATASET MODE`](#sanity-dataset-visibility-set-dataset-mode)
- [`sanity debug`](#sanity-debug)
- [`sanity deploy [SOURCEDIR]`](#sanity-deploy-sourcedir)
- [`sanity dev`](#sanity-dev)
- [`sanity docs browse`](#sanity-docs-browse)
- [`sanity docs read PATH`](#sanity-docs-read-path)
- [`sanity docs search QUERY`](#sanity-docs-search-query)
- [`sanity documents create [FILE]`](#sanity-documents-create-file)
- [`sanity documents delete ID [IDS]`](#sanity-documents-delete-id-ids)
- [`sanity documents get DOCUMENTID`](#sanity-documents-get-documentid)
- [`sanity documents query QUERY`](#sanity-documents-query-query)
- [`sanity documents validate`](#sanity-documents-validate)
- [`sanity exec SCRIPT`](#sanity-exec-script)
- [`sanity functions add`](#sanity-functions-add)
- [`sanity functions dev`](#sanity-functions-dev)
- [`sanity functions env add NAME KEY VALUE`](#sanity-functions-env-add-name-key-value)
- [`sanity functions env list NAME`](#sanity-functions-env-list-name)
- [`sanity functions env remove NAME KEY`](#sanity-functions-env-remove-name-key)
- [`sanity functions logs [NAME]`](#sanity-functions-logs-name)
- [`sanity functions test [NAME]`](#sanity-functions-test-name)
- [`sanity graphql list`](#sanity-graphql-list)
- [`sanity graphql undeploy`](#sanity-graphql-undeploy)
- [`sanity help [COMMAND]`](#sanity-help-command)
- [`sanity hook attempt ATTEMPTID`](#sanity-hook-attempt-attemptid)
- [`sanity hook create`](#sanity-hook-create)
- [`sanity hook delete [NAME]`](#sanity-hook-delete-name)
- [`sanity hook list`](#sanity-hook-list)
- [`sanity hook logs [NAME]`](#sanity-hook-logs-name)
- [`sanity init`](#sanity-init)
- [`sanity install [PACKAGES]`](#sanity-install-packages)
- [`sanity learn`](#sanity-learn)
- [`sanity login`](#sanity-login)
- [`sanity logout`](#sanity-logout)
- [`sanity manage`](#sanity-manage)
- [`sanity manifest extract`](#sanity-manifest-extract)
- [`sanity mcp configure`](#sanity-mcp-configure)
- [`sanity media create-aspect`](#sanity-media-create-aspect)
- [`sanity media delete-aspect ASPECTNAME`](#sanity-media-delete-aspect-aspectname)
- [`sanity media deploy-aspect [ASPECTNAME]`](#sanity-media-deploy-aspect-aspectname)
- [`sanity media export [DESTINATION]`](#sanity-media-export-destination)
- [`sanity media import SOURCE`](#sanity-media-import-source)
- [`sanity migration create [TITLE]`](#sanity-migration-create-title)
- [`sanity migration list`](#sanity-migration-list)
- [`sanity migration run [ID]`](#sanity-migration-run-id)
- [`sanity openapi get SLUG`](#sanity-openapi-get-slug)
- [`sanity openapi list`](#sanity-openapi-list)
- [`sanity preview [OUTPUTDIR]`](#sanity-preview-outputdir)
- [`sanity projects list`](#sanity-projects-list)
- [`sanity schema delete`](#sanity-schema-delete)
- [`sanity schema deploy`](#sanity-schema-deploy)
- [`sanity schema extract`](#sanity-schema-extract)
- [`sanity schema list`](#sanity-schema-list)
- [`sanity schema validate`](#sanity-schema-validate)
- [`sanity start [OUTPUTDIR]`](#sanity-start-outputdir)
- [`sanity telemetry disable`](#sanity-telemetry-disable)
- [`sanity telemetry enable`](#sanity-telemetry-enable)
- [`sanity telemetry status`](#sanity-telemetry-status)
- [`sanity tokens add [LABEL]`](#sanity-tokens-add-label)
- [`sanity tokens delete [TOKENID]`](#sanity-tokens-delete-tokenid)
- [`sanity tokens list`](#sanity-tokens-list)
- [`sanity undeploy`](#sanity-undeploy)
- [`sanity users invite [EMAIL]`](#sanity-users-invite-email)
- [`sanity users list`](#sanity-users-list)
- [`sanity versions`](#sanity-versions)

## `sanity backup disable [DATASET]`

Disable backup for a dataset.

```
USAGE
  $ sanity backup disable [DATASET]

ARGUMENTS
  [DATASET]  Dataset name to disable backup for

DESCRIPTION
  Disable backup for a dataset.

EXAMPLES
  Interactively disable backup for a dataset

    $ sanity backup disable

  Disable backup for the production dataset

    $ sanity backup disable production
```

_See code: [src/commands/backup/disable.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/backup/disable.ts)_

## `sanity backup download [DATASET]`

Download a dataset backup to a local file.

```
USAGE
  $ sanity backup download [DATASET] [--backup-id <value>] [--concurrency <value>] [--out <value>] [--overwrite]

ARGUMENTS
  [DATASET]  Dataset name to download backup from

FLAGS
  --backup-id=<value>    The backup ID to download
  --concurrency=<value>  [default: 10] Concurrent number of backup item downloads (max: 24)
  --out=<value>          The file or directory path the backup should download to
  --overwrite            Allows overwriting of existing backup file

DESCRIPTION
  Download a dataset backup to a local file.

EXAMPLES
  Interactively download a backup

    $ sanity backup download

  Download a specific backup for the production dataset

    $ sanity backup download production --backup-id 2024-01-01-backup-1

  Download backup to a specific file

    $ sanity backup download production --backup-id 2024-01-01-backup-2 --out /path/to/file

  Download backup and overwrite existing file

    $ sanity backup download production --backup-id 2024-01-01-backup-3 --out /path/to/file --overwrite
```

_See code: [src/commands/backup/download.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/backup/download.ts)_

## `sanity backup enable [DATASET]`

Enable backup for a dataset.

```
USAGE
  $ sanity backup enable [DATASET]

ARGUMENTS
  [DATASET]  Dataset name to enable backup for

DESCRIPTION
  Enable backup for a dataset.

EXAMPLES
  Interactively enable backup for a dataset

    $ sanity backup enable

  Enable backup for the production dataset

    $ sanity backup enable production
```

_See code: [src/commands/backup/enable.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/backup/enable.ts)_

## `sanity backup list [DATASET]`

List available backups for a dataset.

```
USAGE
  $ sanity backup list [DATASET] [--after <value>] [--before <value>] [-l <value>]

ARGUMENTS
  [DATASET]  Dataset name to list backups for

FLAGS
  -l, --limit=<value>   [default: 30] Maximum number of backups returned
      --after=<value>   Only return backups after this date (inclusive, YYYY-MM-DD format)
      --before=<value>  Only return backups before this date (exclusive, YYYY-MM-DD format)

DESCRIPTION
  List available backups for a dataset.

EXAMPLES
  List backups for a dataset interactively

    $ sanity backup list

  List backups for the production dataset

    $ sanity backup list production

  List up to 50 backups for the production dataset

    $ sanity backup list production --limit 50

  List up to 10 backups created after 2024-01-31

    $ sanity backup list production --after 2024-01-31 --limit 10
```

_See code: [src/commands/backup/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/backup/list.ts)_

## `sanity blueprints add TYPE`

Add a function resource to a Blueprint

```
USAGE
  $ sanity blueprints add TYPE [--example <value> | -n <value> | --fn-type
    document-create|document-delete|document-update|document-publish|media-library-asset-create|media-library-asset-upda
    te|media-library-asset-delete... | --language ts|js | --javascript | --fn-helpers | --fn-installer
    skip|npm|pnpm|yarn] [-i | ]

ARGUMENTS
  TYPE  (function) Type of resource to add (only "function" is supported)

FLAGS
  -i, --install                Shortcut for --fn-installer npm
  -n, --name=<value>           Name of the resource to add
      --example=<value>        Example to use for the function resource. Discover examples at
                               https://www.sanity.io/exchange/type=recipes/by=sanity
      --[no-]fn-helpers        Add helpers to the new function
      --fn-installer=<option>  Which package manager to use when installing the @sanity/functions helpers
                               <options: skip|npm|pnpm|yarn>
      --fn-type=<option>...    Document change event(s) that should trigger the function; you can specify multiple
                               events by specifying this flag multiple times
                               <options: document-create|document-delete|document-update|document-publish|media-library-
                               asset-create|media-library-asset-update|media-library-asset-delete>
      --javascript             Use JavaScript instead of TypeScript
      --language=<option>      [default: ts] Language of the new function
                               <options: ts|js>

DESCRIPTION
  Add a function resource to a Blueprint

  Scaffolds a new Sanity Function in your Blueprint. Functions are serverless handlers triggered by document events
  (create, update, delete, publish) or media library events.

  After adding a function, use 'functions dev' to test locally, then 'blueprints deploy' to publish it.

EXAMPLES
  $ sanity blueprints add function

  $ sanity blueprints add function --helpers

  $ sanity blueprints add function --name my-function

  $ sanity blueprints add function --name my-function --fn-type document-create

  $ sanity blueprints add function --name my-function --fn-type document-create --fn-type document-update --lang js
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/add.ts)_

## `sanity blueprints config`

View or edit the local Blueprint configuration

```
USAGE
  $ sanity blueprints config [--project-id <value> -e] [--stack-id <value> ]

FLAGS
  -e, --edit                Modify the configuration interactively, or directly when combined with ID flags.
      --project-id=<value>  Directly set the project ID in the configuration. Requires --edit flag
      --stack-id=<value>    Directly set the Stack ID in the configuration. Requires --edit flag

DESCRIPTION
  View or edit the local Blueprint configuration

  Manages the local Blueprint configuration, which links your Blueprint to a Sanity project and Stack.

  Without flags, displays the current configuration. Use --edit to interactively modify settings, or combine --edit with
  ID flags to update values directly (useful for scripting and automation).

  If you need to switch your Blueprint to a different Stack, use --edit --stack-id.

EXAMPLES
  $ sanity blueprints config

  $ sanity blueprints config --edit

  $ sanity blueprints config --edit --project-id <projectId>

  $ sanity blueprints config --edit --project-id <projectId> --stack-id <stackId>
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/config.ts)_

## `sanity blueprints deploy`

Deploy the local Blueprint to the remote Stack

```
USAGE
  $ sanity blueprints deploy [--no-wait]

FLAGS
  --no-wait  Do not wait for Stack deployment to complete

DESCRIPTION
  Deploy the local Blueprint to the remote Stack

  Pushes your local Blueprint configuration to the remote Stack; provisioning, updating, or destroying resources as
  needed. This is the primary command for applying infrastructure changes.

  Before deploying, run 'blueprints plan' to preview changes. After deployment, use 'blueprints info' to verify Stack
  status or 'blueprints logs' to monitor activity.

  Use --no-wait to queue the deployment and return immediately without waiting for completion.

EXAMPLES
  $ sanity blueprints deploy

  $ sanity blueprints deploy --no-wait
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/deploy.ts)_

## `sanity blueprints destroy`

Destroy the remote Stack deployment and its resources (will not delete local files)

```
USAGE
  $ sanity blueprints destroy [--project-id <value> --stack-id <value> --force] [--no-wait]

FLAGS
  --force               Force Stack destruction (skip confirmation)
  --no-wait             Do not wait for Stack destruction to complete
  --project-id=<value>  Project associated with the Stack
  --stack-id=<value>    Stack ID to destroy (defaults to current Stack)

DESCRIPTION
  Destroy the remote Stack deployment and its resources (will not delete local files)

  Permanently removes the remote Stack and all its provisioned resources. Your local Blueprint files remain untouched,
  allowing you to redeploy later with 'blueprints init' + 'blueprints deploy'.

  This is a destructive operation. You will be prompted to confirm unless --force is specified.

  Use this to clean up test environments or decommission a Stack you no longer need.

EXAMPLES
  $ sanity blueprints destroy

  $ sanity blueprints destroy --stack-id <stackId> --project-id <projectId> --force --no-wait
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/destroy.ts)_

## `sanity blueprints doctor`

Diagnose potential issues with local Blueprint and remote Stack configuration

```
USAGE
  $ sanity blueprints doctor [--json] [--path <value>] [--verbose] [--fix]

FLAGS
  --fix           Interactively fix configuration issues
  --json          Format output as json.
  --path=<value>  Path to the directory containing the Blueprint
  --verbose       Verbose output

DESCRIPTION
  Diagnose potential issues with local Blueprint and remote Stack configuration

  Analyzes your local Blueprint and remote Stack configuration for common issues, such as missing authentication,
  invalid project references, or misconfigured resources.

  Run this command when encountering errors with other Blueprint commands. Use --fix to interactively resolve detected
  issues.
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/doctor.ts)_

## `sanity blueprints info`

Show information about the local Blueprint's remote Stack deployment

```
USAGE
  $ sanity blueprints info [--id <value>]

FLAGS
  --id=<value>  Stack ID to show info for (defaults to the current Stack)

DESCRIPTION
  Show information about the local Blueprint's remote Stack deployment

  Displays the current state and metadata of your remote Stack deployment, including deployed resources, status, and
  configuration.

  Use this command to verify a deployment succeeded, check what resources are live, or confirm which Stack your local
  Blueprint is connected to.

  Run 'blueprints stacks' to see all available Stacks in your project or organization.

EXAMPLES
  $ sanity blueprints info

  $ sanity blueprints info --id <stackId>
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/info.ts)_

## `sanity blueprints init [DIR]`

Initialize a local Blueprint and optionally provision a remote Stack deployment

```
USAGE
  $ sanity blueprints init [DIR] [--verbose] [--dir <value>] [--example <value> | --blueprint-type json|js|ts |
    --stack-id <value> | --stack-name <value>] [--project-id <value>]

ARGUMENTS
  [DIR]  Directory to create the local Blueprint in

FLAGS
  --blueprint-type=<option>  Blueprint manifest type to use for the local Blueprint
                             <options: json|js|ts>
  --dir=<value>              Directory to create the local Blueprint in
  --example=<value>          Example to use for the local Blueprint
  --project-id=<value>       Sanity project ID used to scope local Blueprint and remote Stack
  --stack-id=<value>         Existing Stack ID used to scope local Blueprint
  --stack-name=<value>       Name to use for a new Stack provisioned during initialization
  --verbose                  Verbose output

DESCRIPTION
  Initialize a local Blueprint and optionally provision a remote Stack deployment

  A Blueprint is your local infrastructure-as-code configuration that defines Sanity resources (datasets, functions,
  etc.). A Stack is the remote deployment target where your Blueprint is applied.
  [NOTE: Currently, accounts are limited to three (3) Stacks per project scope.]

  This is typically the first command you run in a new project. It creates a local Blueprint manifest file
  (sanity.blueprint.ts, .js, or .json) and provisions a new remote Stack.
  Additionally, a Blueprint configuration file is created in .sanity/ containing the scope and Stack IDs. This is
  .gitignored by default.

  After initialization, use 'blueprints plan' to preview changes, then 'blueprints deploy' to apply them.

EXAMPLES
  $ sanity blueprints init

  $ sanity blueprints init [directory]

  $ sanity blueprints init --blueprint-type <json|js|ts>

  $ sanity blueprints init --blueprint-type <json|js|ts> --project-id <projectId> --stack-id <stackId>

  $ sanity blueprints init --blueprint-type <json|js|ts> --stack-name <stackName>
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/init.ts)_

## `sanity blueprints logs`

Display logs for the current Blueprint's Stack deployment

```
USAGE
  $ sanity blueprints logs [-w]

FLAGS
  -w, --watch  Watch for new Stack logs (streaming mode)

DESCRIPTION
  Display logs for the current Blueprint's Stack deployment

  Retrieves Stack deployment logs, useful for debugging and monitoring deployment activity.

  Use --watch (-w) to stream logs in real-time.

  If you're not seeing expected logs, verify your Stack is deployed with 'blueprints info'.

EXAMPLES
  $ sanity blueprints logs

  $ sanity blueprints logs --watch
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/logs.ts)_

## `sanity blueprints plan`

Enumerate resources to be deployed to the remote Stack - will not modify any resources

```
USAGE
  $ sanity blueprints plan

DESCRIPTION
  Enumerate resources to be deployed to the remote Stack - will not modify any resources

  Use this command to preview what changes will be applied to your remote Stack before deploying. This is a safe,
  read-only operation—no resources are created, modified, or deleted.

  Run 'blueprints plan' after making local changes to your Blueprint manifest to verify the expected diff. When ready,
  run 'blueprints deploy' to apply changes.

EXAMPLES
  $ sanity blueprints plan
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/plan.ts)_

## `sanity blueprints stacks`

List all remote Stack deployments (defaults to the current Blueprint's project scope)

```
USAGE
  $ sanity blueprints stacks [--project-id <value> | ]

FLAGS
  --project-id=<value>  Project ID to show Stack deployments for

DESCRIPTION
  List all remote Stack deployments (defaults to the current Blueprint's project scope)

  Shows all Stacks associated with a project or organization. By default, lists Stacks scoped to the local Blueprint.

  Use this to discover existing Stacks you can scope a local Blueprint to (using 'blueprints config --edit'), or to
  audit what's deployed across your project.

EXAMPLES
  $ sanity blueprints stacks

  $ sanity blueprints stacks --project-id <projectId>

  $ sanity blueprints stacks --organization-id <organizationId>
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/blueprints/stacks.ts)_

## `sanity build [OUTPUTDIR]`

Builds the Sanity Studio configuration into a static bundle

```
USAGE
  $ sanity build [OUTPUTDIR] [--auto-updates] [--minify] [--source-maps] [--stats] [-y]

ARGUMENTS
  [OUTPUTDIR]  Output directory

FLAGS
  -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults
      --[no-]auto-updates  Enable/disable auto updates of studio versions
      --[no-]minify        Enable/disable minifying of built bundles
      --[no-]source-maps   Enable source maps for built bundles (increases size of bundle)
      --stats              Show stats about the built bundles

DESCRIPTION
  Builds the Sanity Studio configuration into a static bundle

EXAMPLES
  $ sanity build

  $ sanity build --no-minify --source-maps
```

_See code: [src/commands/build.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/build.ts)_

## `sanity codemod [CODEMODNAME]`

Updates Sanity Studio codebase with a code modification script

```
USAGE
  $ sanity codemod [CODEMODNAME] [--dry] [--extensions <value>] [--no-verify]

ARGUMENTS
  [CODEMODNAME]  Name of the codemod to run

FLAGS
  --dry                 Dry run (no changes are made to files)
  --extensions=<value>  [default: js,ts,tsx] Transform files with these file extensions (comma separated)
  --no-verify           Skip verification steps before running codemod

DESCRIPTION
  Updates Sanity Studio codebase with a code modification script

EXAMPLES
  Show available code mods

    $ sanity codemod

  Run codemod to transform react-icons imports (dry run)

    $ sanity codemod reactIconsV3 --dry
```

_See code: [src/commands/codemod.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/codemod.ts)_

## `sanity cors add ORIGIN`

Allow a new origin to use your project API through CORS

```
USAGE
  $ sanity cors add ORIGIN [--credentials]

ARGUMENTS
  ORIGIN  Origin to allow (e.g., https://example.com)

FLAGS
  --[no-]credentials  Allow credentials (token/cookie) to be sent from this origin

DESCRIPTION
  Allow a new origin to use your project API through CORS

EXAMPLES
  Interactively add a CORS origin

    $ sanity cors add

  Add a localhost origin without credentials

    $ sanity cors add http://localhost:3000 --no-credentials

  Add a production origin with credentials allowed

    $ sanity cors add https://myapp.com --credentials
```

_See code: [src/commands/cors/add.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/cors/add.ts)_

## `sanity cors delete [ORIGIN]`

Delete an existing CORS origin from your project

```
USAGE
  $ sanity cors delete [ORIGIN]

ARGUMENTS
  [ORIGIN]  Origin to delete (will prompt if not provided)

DESCRIPTION
  Delete an existing CORS origin from your project

EXAMPLES
  Interactively select and delete a CORS origin

    $ sanity cors delete

  Delete a specific CORS origin

    $ sanity cors delete https://example.com
```

_See code: [src/commands/cors/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/cors/delete.ts)_

## `sanity cors list`

List all origins allowed to access the API for this project

```
USAGE
  $ sanity cors list

DESCRIPTION
  List all origins allowed to access the API for this project

EXAMPLES
  List CORS origins for the current project

    $ sanity cors list
```

_See code: [src/commands/cors/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/cors/list.ts)_

## `sanity dataset alias create [ALIASNAME] [TARGETDATASET]`

Create a dataset alias within your project

```
USAGE
  $ sanity dataset alias create [ALIASNAME] [TARGETDATASET]

ARGUMENTS
  [ALIASNAME]      Dataset alias name to create
  [TARGETDATASET]  Target dataset name to link the alias to

DESCRIPTION
  Create a dataset alias within your project

EXAMPLES
  Create an alias with interactive prompts

    $ sanity dataset alias create

  Create alias named "conference" with interactive dataset selection

    $ sanity dataset alias create conference

  Create alias "conference" linked to "conf-2025" dataset

    $ sanity dataset alias create conference conf-2025

  Create alias with explicit ~ prefix

    $ sanity dataset alias create ~conference conf-2025
```

_See code: [src/commands/dataset/alias/create.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/alias/create.ts)_

## `sanity dataset alias delete ALIASNAME`

Delete a dataset alias within your project

```
USAGE
  $ sanity dataset alias delete ALIASNAME [--force]

ARGUMENTS
  ALIASNAME  Dataset alias name to delete

FLAGS
  --force  Skip confirmation prompt and delete immediately

DESCRIPTION
  Delete a dataset alias within your project

EXAMPLES
  Delete alias named "conference" with confirmation prompt

    $ sanity dataset alias delete conference

  Delete alias with explicit ~ prefix

    $ sanity dataset alias delete ~conference

  Delete alias named "conference" without confirmation prompt

    $ sanity dataset alias delete conference --force
```

_See code: [src/commands/dataset/alias/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/alias/delete.ts)_

## `sanity dataset alias link [ALIASNAME] [TARGETDATASET]`

Link a dataset alias to a dataset within your project

```
USAGE
  $ sanity dataset alias link [ALIASNAME] [TARGETDATASET] [--force]

ARGUMENTS
  [ALIASNAME]      Dataset alias name to link
  [TARGETDATASET]  Target dataset name to link the alias to

FLAGS
  --force  Skip confirmation prompt when relinking existing alias

DESCRIPTION
  Link a dataset alias to a dataset within your project

EXAMPLES
  Link an alias with interactive prompts

    $ sanity dataset alias link

  Link alias named "conference" with interactive dataset selection

    $ sanity dataset alias link conference

  Link alias "conference" to "conf-2025" dataset

    $ sanity dataset alias link conference conf-2025

  Link alias with explicit ~ prefix

    $ sanity dataset alias link ~conference conf-2025

  Force link without confirmation (skip relink prompt)

    $ sanity dataset alias link conference conf-2025 --force
```

_See code: [src/commands/dataset/alias/link.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/alias/link.ts)_

## `sanity dataset alias unlink [ALIASNAME]`

Unlink a dataset alias from its dataset within your project

```
USAGE
  $ sanity dataset alias unlink [ALIASNAME] [--force]

ARGUMENTS
  [ALIASNAME]  Dataset alias name to unlink

FLAGS
  --force  Skip confirmation prompt and unlink immediately

DESCRIPTION
  Unlink a dataset alias from its dataset within your project

EXAMPLES
  Unlink an alias with interactive selection

    $ sanity dataset alias unlink

  Unlink alias "conference" with confirmation prompt

    $ sanity dataset alias unlink conference

  Unlink alias with explicit ~ prefix

    $ sanity dataset alias unlink ~conference

  Unlink alias "conference" without confirmation prompt

    $ sanity dataset alias unlink conference --force
```

_See code: [src/commands/dataset/alias/unlink.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/alias/unlink.ts)_

## `sanity dataset copy [SOURCE] [TARGET]`

Manages dataset copying, including starting a new copy job, listing copy jobs and following the progress of a running copy job

```
USAGE
  $ sanity dataset copy [SOURCE] [TARGET] [--attach <value> | --list | --detach | --skip-history] [--limit <value>
    ] [--offset <value> ]

ARGUMENTS
  [SOURCE]  Name of the dataset to copy from
  [TARGET]  Name of the dataset to copy to

FLAGS
  --attach=<value>  Attach to the running copy process to show progress
  --detach          Start the copy without waiting for it to finish
  --limit=<value>   Maximum number of jobs returned (default 10, max 1000)
  --list            Lists all dataset copy jobs
  --offset=<value>  Start position in the list of jobs (default 0)
  --skip-history    Don't preserve document history on copy

DESCRIPTION
  Manages dataset copying, including starting a new copy job, listing copy jobs and following the progress of a running
  copy job

EXAMPLES
  Interactively copy a dataset

    $ sanity dataset copy

  Copy from source-dataset (prompts for target)

    $ sanity dataset copy source-dataset

  Copy from source-dataset to target-dataset

    $ sanity dataset copy source-dataset target-dataset

  Copy without preserving document history (faster for large datasets)

    $ sanity dataset copy --skip-history source target

  Start copy job without waiting for completion

    $ sanity dataset copy --detach source target

  Attach to a running copy job to follow progress

    $ sanity dataset copy --attach <job-id>

  List all dataset copy jobs

    $ sanity dataset copy --list

  List copy jobs with pagination

    $ sanity dataset copy --list --offset 2 --limit 10
```

_See code: [src/commands/dataset/copy.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/copy.ts)_

## `sanity dataset create [NAME]`

Create a new dataset within your project

```
USAGE
  $ sanity dataset create [NAME] [--visibility custom|private|public]

ARGUMENTS
  [NAME]  Name of the dataset to create

FLAGS
  --visibility=<option>  Set visibility for this dataset (custom/private/public)
                         <options: custom|private|public>

DESCRIPTION
  Create a new dataset within your project

EXAMPLES
  Interactively create a dataset

    $ sanity dataset create

  Create a dataset named "my-dataset"

    $ sanity dataset create my-dataset

  Create a private dataset named "my-dataset"

    $ sanity dataset create my-dataset --visibility private
```

_See code: [src/commands/dataset/create.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/create.ts)_

## `sanity dataset delete DATASETNAME`

Delete a dataset within your project

```
USAGE
  $ sanity dataset delete DATASETNAME [--force]

ARGUMENTS
  DATASETNAME  Dataset name to delete

FLAGS
  --force  Do not prompt for delete confirmation - forcefully delete

DESCRIPTION
  Delete a dataset within your project

EXAMPLES
  Delete a specific dataset

    $ sanity dataset delete my-dataset

  Delete a specific dataset without confirmation

    $ sanity dataset delete my-dataset --force
```

_See code: [src/commands/dataset/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/delete.ts)_

## `sanity dataset export [NAME] [DESTINATION]`

Export dataset to local filesystem as a gzipped tarball. Assets failing with HTTP status codes 401, 403 and 404 upon download are ignored and excluded from export.

```
USAGE
  $ sanity dataset export [NAME] [DESTINATION] [--asset-concurrency <value>] [--mode stream|cursor] [--no-assets]
    [--no-compress] [--no-drafts] [--overwrite] [--raw] [--types <value>]

ARGUMENTS
  [NAME]         Name of the dataset to export
  [DESTINATION]  Output destination file path

FLAGS
  --asset-concurrency=<value>  [default: 8] Concurrent number of asset downloads
  --mode=<option>              [default: stream] Mode to export documents with `cursor` might be more performant for
                               larger datasets, but might not be as accurate if the dataset is being modified during
                               export
                               <options: stream|cursor>
  --no-assets                  Export only non-asset documents and remove references to image assets
  --no-compress                Skips compressing tarball entries (still generates a gzip file)
  --no-drafts                  Export only published versions of documents
  --overwrite                  Overwrite any file with the same name
  --raw                        Extract only documents, without rewriting asset references
  --types=<value>              Defines which document types to export (comma-separated)

DESCRIPTION
  Export dataset to local filesystem as a gzipped tarball. Assets failing with HTTP status codes 401, 403 and 404 upon
  download are ignored and excluded from export.

EXAMPLES
  Export dataset "moviedb" to localPath.tar.gz

    $ sanity dataset export moviedb localPath.tar.gz

  Export dataset without assets

    $ sanity dataset export moviedb assetless.tar.gz --no-assets

  Export raw documents without asset reference rewriting

    $ sanity dataset export staging staging.tar.gz --raw

  Export specific document types

    $ sanity dataset export staging staging.tar.gz --types products,shops
```

_See code: [src/commands/dataset/export.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/export.ts)_

## `sanity dataset import SOURCE`

Import documents to a Sanity dataset

```
USAGE
  $ sanity dataset import SOURCE -p <value> -d <value> [-t <value>] [--replace | --missing] [--allow-failing-assets]
    [--allow-assets-in-different-dataset] [--replace-assets] [--skip-cross-dataset-references]
    [--allow-replacement-characters] [--allow-system-documents] [--asset-concurrency <value>]

ARGUMENTS
  SOURCE  Source file (use "-" for stdin)

FLAGS
  -d, --dataset=<value>                    (required) Dataset to import to
  -p, --project=<value>                    (required) Project ID to import to
  -t, --token=<value>                      [env: SANITY_IMPORT_TOKEN] Token to authenticate with
      --allow-assets-in-different-dataset  Allow asset documents to reference different project/dataset
      --allow-failing-assets               Skip assets that cannot be fetched/uploaded
      --allow-replacement-characters       Allow unicode replacement characters in imported documents
      --allow-system-documents             Imports system documents
      --asset-concurrency=<value>          Number of parallel asset imports
      --missing                            Skip documents that already exist
      --replace                            Replace documents with the same IDs
      --replace-assets                     Skip reuse of existing assets
      --skip-cross-dataset-references      Skips references to other datasets

DESCRIPTION
  Import documents to a Sanity dataset

EXAMPLES
  Import "./my-dataset.ndjson" into dataset "staging"

    $ sanity dataset import -p myPrOj -d staging -t someSecretToken my-dataset.ndjson

  Import into dataset "test" from stdin, read token from env var

    cat my-dataset.ndjson | sanity dataset import -p myPrOj -d test -
```

_See code: [src/commands/dataset/import.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/import.ts)_

## `sanity dataset list`

List datasets of your project

```
USAGE
  $ sanity dataset list

DESCRIPTION
  List datasets of your project

EXAMPLES
  List datasets of your project

    $ sanity dataset list
```

_See code: [src/commands/dataset/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/list.ts)_

## `sanity dataset visibility get DATASET`

Get the visibility of a dataset

```
USAGE
  $ sanity dataset visibility get DATASET

ARGUMENTS
  DATASET  The name of the dataset to get visibility for

DESCRIPTION
  Get the visibility of a dataset

EXAMPLES
  Check the visibility of a dataset

    $ sanity dataset visibility get my-dataset
```

_See code: [src/commands/dataset/visibility/get.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/visibility/get.ts)_

## `sanity dataset visibility set DATASET MODE`

Set the visibility of a dataset

```
USAGE
  $ sanity dataset visibility set DATASET MODE

ARGUMENTS
  DATASET  The name of the dataset to set visibility for
  MODE     (public|private) The visibility mode to set

DESCRIPTION
  Set the visibility of a dataset

EXAMPLES
  Make a dataset private

    $ sanity dataset visibility set my-dataset private

  Make a dataset public

    $ sanity dataset visibility set my-dataset public
```

_See code: [src/commands/dataset/visibility/set.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dataset/visibility/set.ts)_

## `sanity debug`

Provides diagnostic info for Sanity Studio troubleshooting

```
USAGE
  $ sanity debug [--secrets]

FLAGS
  --secrets  Include API keys in output

DESCRIPTION
  Provides diagnostic info for Sanity Studio troubleshooting

EXAMPLES
  $ sanity debug

  $ sanity debug --secrets
```

_See code: [src/commands/debug.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/debug.ts)_

## `sanity deploy [SOURCEDIR]`

Builds and deploys Sanity Studio or application to Sanity hosting

```
USAGE
  $ sanity deploy [SOURCEDIR] [--auto-updates] [--build] [--minify] [--schema-required] [--source-maps]
    [--verbose] [-y]

ARGUMENTS
  [SOURCEDIR]  Source directory

FLAGS
  -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults
      --[no-]auto-updates  Automatically update the studio to the latest version
      --[no-]build         Don't build the studio prior to deploy, instead deploying the version currently in `dist/`
      --[no-]minify        Skip minifying built JavaScript (speeds up build, increases size of bundle)
      --schema-required    Fail-fast deployment if schema store fails
      --source-maps        Enable source maps for built bundles (increases size of bundle)
      --verbose            Enable verbose logging

DESCRIPTION
  Builds and deploys Sanity Studio or application to Sanity hosting

EXAMPLES
  Build the studio

    $ sanity deploy

  Deploys non-minified build with source maps

    $ sanity deploy --no-minify --source-maps

  Fail fast on schema store fails - for when other services rely on the stored schema

    $ sanity deploy --schema-required
```

_See code: [src/commands/deploy.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/deploy.ts)_

## `sanity dev`

Starts a local development server for Sanity Studio with live reloading

```
USAGE
  $ sanity dev [--auto-updates] [--host <value>] [--load-in-dashboard] [--port <value>]

FLAGS
  --[no-]auto-updates       Automatically update Sanity Studio dependencies.
  --host=<value>            [default: localhost] The local network interface at which to listen.
  --[no-]load-in-dashboard  Load the app/studio in the Sanity dashboard.
  --port=<value>            [default: 3333] TCP port to start server on.

DESCRIPTION
  Starts a local development server for Sanity Studio with live reloading

EXAMPLES
  $ sanity dev --host=0.0.0.0

  $ sanity dev --port=1942

  $ sanity dev --load-in-dashboard
```

_See code: [src/commands/dev.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/dev.ts)_

## `sanity docs browse`

Open Sanity docs in a web browser

```
USAGE
  $ sanity docs browse

DESCRIPTION
  Open Sanity docs in a web browser
```

_See code: [src/commands/docs/browse.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/docs/browse.ts)_

## `sanity docs read PATH`

Read an article in terminal

```
USAGE
  $ sanity docs read PATH [--web]

ARGUMENTS
  PATH  Path or URL to article, found in search results and docs content as links

FLAGS
  --web  Open in a web browser

DESCRIPTION
  Read an article in terminal

EXAMPLES
  Read as markdown in terminal

    $ sanity docs read /docs/studio/installation

  Read using full URL

    $ sanity docs read https://www.sanity.io/docs/studio/installation

  Open in web browser

    $ sanity docs read /docs/studio/installation --web

  Open using full URL in web browser

    $ sanity docs read https://www.sanity.io/docs/studio/installation -w
```

_See code: [src/commands/docs/read.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/docs/read.ts)_

## `sanity docs search QUERY`

Search Sanity docs

```
USAGE
  $ sanity docs search QUERY [--limit <value>]

ARGUMENTS
  QUERY  Search query for documentation

FLAGS
  --limit=<value>  [default: 10] Maximum number of results to return

DESCRIPTION
  Search Sanity docs

EXAMPLES
  Search for documentation about schemas

    $ sanity docs search schema

  Search with phrase

    $ sanity docs search "groq functions"

  Limit search results

    $ sanity docs search "deployment" --limit=5
```

_See code: [src/commands/docs/search.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/docs/search.ts)_

## `sanity documents create [FILE]`

Create one or more documents

```
USAGE
  $ sanity documents create [FILE] [-d <value>] [--id <value>] [--json5] [--missing] [--replace] [--watch]

ARGUMENTS
  [FILE]  JSON file to create document(s) from

FLAGS
  -d, --dataset=<value>  Dataset to create document(s) in (overrides config)
      --id=<value>       Specify a document ID to use. Will fetch remote document ID and populate editor.
      --json5            Use JSON5 file type to allow a "simplified" version of JSON
      --missing          On duplicate document IDs, don't modify the target document(s)
      --replace          On duplicate document IDs, replace existing document with specified document(s)
      --watch            Write the documents whenever the target file or buffer changes

DESCRIPTION
  Create one or more documents

EXAMPLES
  Create the document specified in "myDocument.json"

    $ sanity documents create myDocument.json

  Open configured $EDITOR and create the specified document(s)

    $ sanity documents create

  Fetch document with the ID "myDocId" and open configured $EDITOR with the current document content (if any). Replace
  document with the edited version when the editor closes

    $ sanity documents create --id myDocId --replace

  Open configured $EDITOR and replace the document with the given content on each save. Use JSON5 file extension and
  parser for simplified syntax.

    $ sanity documents create --id myDocId --watch --replace --json5
```

_See code: [src/commands/documents/create.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/documents/create.ts)_

## `sanity documents delete ID [IDS]`

Delete one or more documents from the projects configured dataset

```
USAGE
  $ sanity documents delete ID... [IDS...] [--dataset <value>]

ARGUMENTS
  ID...     Document ID to delete
  [IDS...]  Additional document IDs to delete

FLAGS
  --dataset=<value>  NAME to override dataset

DESCRIPTION
  Delete one or more documents from the projects configured dataset

EXAMPLES
  Delete the document with the ID "myDocId"

    $ sanity documents delete myDocId

  ID wrapped in double or single quote works equally well

    $ sanity documents delete 'myDocId'

  Delete document with ID "someDocId" from dataset "blog"

    $ sanity documents delete --dataset=blog someDocId

  Delete the document with ID "doc1" and "doc2"

    $ sanity documents delete doc1 doc2
```

_See code: [src/commands/documents/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/documents/delete.ts)_

## `sanity documents get DOCUMENTID`

Get and print a document by ID

```
USAGE
  $ sanity documents get DOCUMENTID [-d <value>] [--pretty]

ARGUMENTS
  DOCUMENTID  Document ID to retrieve

FLAGS
  -d, --dataset=<value>  Dataset to get document from (overrides config)
      --pretty           Colorize JSON output

DESCRIPTION
  Get and print a document by ID

EXAMPLES
  Get the document with ID "myDocId"

    $ sanity documents get myDocId

  Get document with colorized JSON output

    $ sanity documents get myDocId --pretty

  Get document from a specific dataset

    $ sanity documents get myDocId --dataset production
```

_See code: [src/commands/documents/get.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/documents/get.ts)_

## `sanity documents query QUERY`

Query for documents

```
USAGE
  $ sanity documents query QUERY [--anonymous] [--api-version <value>] [-d <value>] [--pretty] [-p <value>]

ARGUMENTS
  QUERY  GROQ query to run against the dataset

FLAGS
  -d, --dataset=<value>      Dataset to query (overrides config)
  -p, --project=<value>      Project ID to query (overrides config)
      --anonymous            Send the query without any authorization token
      --api-version=<value>  [env: SANITY_CLI_QUERY_API_VERSION] API version to use (defaults to 2025-08-15)
      --pretty               Colorize JSON output

DESCRIPTION
  Query for documents

EXAMPLES
  Fetch 5 documents of type "movie"

    $ sanity documents query '*[_type == "movie"][0..4]'

  Fetch title of the oldest movie in the dataset named "staging"

    $ sanity documents query '*[_type == "movie"]|order(releaseDate asc)[0]{title}' --dataset staging

  Use API version v2021-06-07 and do a query

    $ sanity documents query '*[_id == "header"] { "headerText": pt::text(body) }' --api-version v2021-06-07
```

_See code: [src/commands/documents/query.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/documents/query.ts)_

## `sanity documents validate`

Validate documents in a dataset against the studio schema

```
USAGE
  $ sanity documents validate [-d <value>] [--file <value>] [--format <value>] [--level error|warning|info]
    [--max-custom-validation-concurrency <value>] [--max-fetch-concurrency <value>] [--workspace <value>] [-y]

FLAGS
  -d, --dataset=<value>                            Override the dataset used. By default, this is derived from the given
                                                   workspace
  -y, --yes                                        Skips the first confirmation prompt
      --file=<value>                               Provide a path to either an .ndjson file or a tarball containing an
                                                   .ndjson file
      --format=<value>                             The output format used to print the found validation markers and
                                                   report progress
      --level=<option>                             [default: warning] The minimum level reported out. Defaults to
                                                   warning
                                                   <options: error|warning|info>
      --max-custom-validation-concurrency=<value>  [default: 5] Specify how many custom validators can run concurrently
      --max-fetch-concurrency=<value>              [default: 25] Specify how many `client.fetch` requests are allow
                                                   concurrency at once
      --workspace=<value>                          The name of the workspace to use when downloading and validating all
                                                   documents

DESCRIPTION
  Validate documents in a dataset against the studio schema

EXAMPLES
  Validates all documents in a Sanity project with more than one workspace

    $ sanity documents validate --workspace default

  Override the dataset specified in the workspace

    $ sanity documents validate --workspace default --dataset staging

  Save the results of the report into a file

    $ sanity documents validate --yes > report.txt

  Report out info level validation markers too

    $ sanity documents validate --level info
```

_See code: [src/commands/documents/validate.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/documents/validate.ts)_

## `sanity exec SCRIPT`

Executes a script within the Sanity Studio context

```
USAGE
  $ sanity exec SCRIPT... [--mock-browser-env] [--with-user-token]

ARGUMENTS
  SCRIPT...  Path to the script to execute

FLAGS
  --mock-browser-env  Mocks a browser-like environment using jsdom
  --with-user-token   Prime access token from CLI config into getCliClient()

DESCRIPTION
  Executes a script within the Sanity Studio context

EXAMPLES
  Run the script at some/script.js in Sanity context

    $ sanity exec some/script.js

  Run the script at migrations/fullname.ts and configure `getCliClient()` from `sanity/cli` to include the current
  user's token

    $ sanity exec migrations/fullname.ts --with-user-token

  Run the script at scripts/browserScript.js in a mock browser environment

    $ sanity exec scripts/browserScript.js --mock-browser-env

  Pass arbitrary arguments to scripts by separating them with a `--`. Arguments are available in `process.argv` as
  they would in regular node scripts (eg the following command would yield a `process.argv` of: `['/path/to/node',
  '/path/to/myscript.js', '--dry-run', 'positional-argument']`)

    $ sanity exec --mock-browser-env myscript.js -- --dry-run positional-argument
```

_See code: [src/commands/exec.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/exec.ts)_

## `sanity functions add`

Add a Function to your Blueprint

```
USAGE
  $ sanity functions add [--example <value> | -n <value> |  | --language ts|js | --javascript |  | ] [--type
    document-create|document-delete|document-update|document-publish|media-library-asset-create|media-library-asset-upda
    te|media-library-asset-delete... ] [--helpers] [--installer skip|npm|pnpm|yarn] [-i | ]

FLAGS
  -i, --install             Shortcut for --fn-installer npm
  -n, --name=<value>        Name of the Function to add
      --example=<value>     Example to use for the Function
      --[no-]helpers        Add helpers to the new Function
      --installer=<option>  How to install the @sanity/functions helpers
                            <options: skip|npm|pnpm|yarn>
      --javascript          Use JavaScript instead of TypeScript
      --language=<option>   [default: ts] Language of the new Function
                            <options: ts|js>
      --type=<option>...    Document change event(s) that should trigger the function; you can specify multiple events
                            by specifying this flag multiple times
                            <options: document-create|document-delete|document-update|document-publish|media-library-ass
                            et-create|media-library-asset-update|media-library-asset-delete>

DESCRIPTION
  Add a Function to your Blueprint

  Scaffolds a new Function in the functions/ folder and templates a resource for your Blueprint manifest.

  Functions are serverless handlers triggered by document events (create, update, delete, publish) or media library
  events.

  After adding, use 'functions dev' to test locally, then 'blueprints deploy' to publish.

EXAMPLES
  $ sanity functions add

  $ sanity functions add --helpers

  $ sanity functions add --name my-function

  $ sanity functions add --name my-function --type document-create

  $ sanity functions add --name my-function --type document-create --type document-update --lang js
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/add.ts)_

## `sanity functions dev`

Start the Sanity Function emulator

```
USAGE
  $ sanity functions dev [-h <value>] [-p <value>] [-t <value>]

FLAGS
  -h, --host=<value>     The local network interface at which to listen. [default: "localhost"]
  -p, --port=<value>     TCP port to start emulator on. [default: 8080]
  -t, --timeout=<value>  Maximum execution time for all functions, in seconds. Takes precedence over function-specific
                         `timeout`

DESCRIPTION
  Start the Sanity Function emulator

  Runs a local, web-based development server to test your functions before deploying.

  Open the emulator in your browser to interactively test your functions with the payload editor.

  Optionally, set the host and port with the --host and --port flags. Function timeout can be configured with the
  --timeout flag.

  To invoke a function with the CLI, use 'functions test'.

EXAMPLES
  $ sanity functions dev --host 127.0.0.1 --port 8974

  $ sanity functions dev --timeout 60
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/dev.ts)_

## `sanity functions env add NAME KEY VALUE`

Add or set an environment variable for a deployed function

```
USAGE
  $ sanity functions env add NAME KEY VALUE

ARGUMENTS
  NAME   The name of the Sanity Function
  KEY    The name of the environment variable
  VALUE  The value of the environment variable

DESCRIPTION
  Add or set an environment variable for a deployed function

  Sets an environment variable in a deployed Sanity Function. If the variable already exists, its value is updated.

  Environment variables are useful for API keys, configuration values, and other secrets that shouldn't be hardcoded.
  Changes take effect on the next function invocation.

EXAMPLES
  $ sanity functions env add MyFunction API_URL https://api.example.com/
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/env/add.ts)_

## `sanity functions env list NAME`

List environment variables for a deployed function

```
USAGE
  $ sanity functions env list NAME

ARGUMENTS
  NAME  The name of the Sanity Function

DESCRIPTION
  List environment variables for a deployed function

  Displays all environment variables (keys only) configured in a deployed Sanity Function.

  Use 'functions env add' to set variables or 'functions env remove' to delete them.

EXAMPLES
  $ sanity functions env list MyFunction
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/env/list.ts)_

## `sanity functions env remove NAME KEY`

Remove an environment variable from a deployed function

```
USAGE
  $ sanity functions env remove NAME KEY

ARGUMENTS
  NAME  The name of the Sanity Function
  KEY   The name of the environment variable

DESCRIPTION
  Remove an environment variable from a deployed function

  Deletes an environment variable from a deployed Sanity Function. The change takes effect on the next function
  invocation.

  Use 'functions env list' to see current variables before removing.

EXAMPLES
  $ sanity functions env remove MyFunction API_URL
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/env/remove.ts)_

## `sanity functions logs [NAME]`

Retrieve or delete logs for a Sanity Function

```
USAGE
  $ sanity functions logs [NAME] [-u] [-f [-d | -l <value> | -j]] [-w]

ARGUMENTS
  [NAME]  The name of the Sanity Function

FLAGS
  -d, --delete         Delete all logs for the function
  -f, --force          Skip confirmation for deleting logs
  -j, --json           Return logs in JSON format
  -l, --limit=<value>  [default: 50] Total number of log entries to retrieve
  -u, --utc            Show dates in UTC time zone
  -w, --watch          Watch for new logs (streaming mode)

DESCRIPTION
  Retrieve or delete logs for a Sanity Function

  Fetches execution logs from a deployed function, useful for debugging production issues or monitoring activity.

  Use --watch (-w) to stream logs in real-time. Use --delete to clear all logs for a function (requires confirmation
  unless --force is specified).

EXAMPLES
  $ sanity functions logs <name>

  $ sanity functions logs <name> --json

  $ sanity functions logs <name> --limit 100

  $ sanity functions logs <name> --delete
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/logs.ts)_

## `sanity functions test [NAME]`

Invoke a local Sanity Function

```
USAGE
  $ sanity functions test [NAME] [--data-before <value> | [-d <value> | -f <value> | --document-id <value>] |  |  |
    --file-before <value> | --file-after <value> | --document-id-before <value> | --document-id-after <value>]
    [--data-after <value> |  |  |  |  |  |  | ] [-e create|update|delete] [-t <value>] [-a <value>] [--with-user-token]
    [--media-library-id <value> | --project-id <value> | --dataset <value>]

ARGUMENTS
  [NAME]  The name of the Sanity Function

FLAGS
  -a, --api=<value>                 Sanity API Version to use
  -d, --data=<value>                Data to send to the function
  -e, --event=<option>              Type of event (create, update, delete)
                                    <options: create|update|delete>
  -f, --file=<value>                Read data from file and send to the function
  -t, --timeout=<value>             Execution timeout value in seconds
      --data-after=<value>          Current document
      --data-before=<value>         Original document
      --dataset=<value>             The Sanity dataset to use
      --document-id=<value>         Document to fetch and send to function
      --document-id-after=<value>   Current document
      --document-id-before=<value>  Original document
      --file-after=<value>          Current document
      --file-before=<value>         Original document
      --media-library-id=<value>    Sanity Media Library ID to use
      --project-id=<value>          Sanity Project ID to use
      --with-user-token             Prime access token from CLI config

DESCRIPTION
  Invoke a local Sanity Function

  Executes a function locally with the provided payload, simulating how it would run when deployed. Use this to test
  your function logic before deploying.

  Provide test data via --data (inline JSON), --file (JSON file), or --document-id (fetch from Sanity). For update
  events, use the before/after flag pairs to simulate document changes.

EXAMPLES
  $ sanity functions test <name> --data '{ "id": 1 }'

  $ sanity functions test <name> --file 'payload.json'

  $ sanity functions test <name> --data '{ "id": 1 }' --timeout 60

  $ sanity functions test <name> --event update --data-before '{ "title": "before" }' --data-after '{ "title": "after" }'
```

_See code: [@sanity/runtime-cli](https://github.com/sanity-io/runtime-cli/blob/v13.0.3/src/commands/functions/test.ts)_

## `sanity graphql list`

List all GraphQL endpoints deployed for this project

```
USAGE
  $ sanity graphql list

DESCRIPTION
  List all GraphQL endpoints deployed for this project

EXAMPLES
  List GraphQL endpoints for the current project

    $ sanity graphql list
```

_See code: [src/commands/graphql/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/graphql/list.ts)_

## `sanity graphql undeploy`

Remove a deployed GraphQL API

```
USAGE
  $ sanity graphql undeploy [--api <value>] [--dataset <value>] [--force] [--project <value>] [--tag <value>]

FLAGS
  --api=<value>      Undeploy API with this ID (project, dataset and tag flags take precedence)
  --dataset=<value>  Dataset to undeploy GraphQL API from
  --force            Skip confirmation prompt
  --project=<value>  Project ID to delete GraphQL API for
  --tag=<value>      [default: default] Tag to undeploy GraphQL API from

DESCRIPTION
  Remove a deployed GraphQL API

EXAMPLES
  Undeploy GraphQL API for current project and dataset

    $ sanity graphql undeploy

  Undeploy API with ID "ios"

    $ sanity graphql undeploy --api ios

  Undeploy GraphQL API for staging dataset

    $ sanity graphql undeploy --dataset staging

  Undeploy GraphQL API for staging dataset with "next" tag

    $ sanity graphql undeploy --dataset staging --tag next

  Undeploy GraphQL API without confirmation prompt

    $ sanity graphql undeploy --force
```

_See code: [src/commands/graphql/undeploy.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/graphql/undeploy.ts)_

## `sanity help [COMMAND]`

Display help for sanity.

```
USAGE
  $ sanity help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for sanity.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.36/src/commands/help.ts)_

## `sanity hook attempt ATTEMPTID`

Print details of a given webhook delivery attempt

```
USAGE
  $ sanity hook attempt ATTEMPTID

ARGUMENTS
  ATTEMPTID  The delivery attempt ID to get details for

DESCRIPTION
  Print details of a given webhook delivery attempt

EXAMPLES
  Print details of webhook delivery attempt with ID abc123

    $ sanity hook attempt abc123
```

_See code: [src/commands/hook/attempt.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/hook/attempt.ts)_

## `sanity hook create`

Create a new webhook for the current project

```
USAGE
  $ sanity hook create

DESCRIPTION
  Create a new webhook for the current project

EXAMPLES
  Create a new webhook for the current project

    $ sanity hook create
```

_See code: [src/commands/hook/create.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/hook/create.ts)_

## `sanity hook delete [NAME]`

Delete a hook within your project

```
USAGE
  $ sanity hook delete [NAME]

ARGUMENTS
  [NAME]  Name of hook to delete (will prompt if not provided)

DESCRIPTION
  Delete a hook within your project

EXAMPLES
  Interactively select and delete a hook

    $ sanity hook delete

  Delete a specific hook by name

    $ sanity hook delete my-hook
```

_See code: [src/commands/hook/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/hook/delete.ts)_

## `sanity hook list`

List hooks for a given project

```
USAGE
  $ sanity hook list

DESCRIPTION
  List hooks for a given project

EXAMPLES
  List hooks for a given project

    $ sanity hook list
```

_See code: [src/commands/hook/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/hook/list.ts)_

## `sanity hook logs [NAME]`

List latest log entries for a given hook

```
USAGE
  $ sanity hook logs [NAME] [--detailed]

ARGUMENTS
  [NAME]  Name of the hook to show logs for

FLAGS
  --detailed  Include detailed payload and attempts

DESCRIPTION
  List latest log entries for a given hook

EXAMPLES
  List latest log entries for a given hook

    $ sanity hook logs

  List latest log entries for a specific hook by name

    $ sanity hook logs [NAME]
```

_See code: [src/commands/hook/logs.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/hook/logs.ts)_

## `sanity init`

Initialize a new Sanity Studio, project and/or app

```
USAGE
  $ sanity init [--json] [--auto-updates | --bare] [--coupon <code> | --project-plan <name>] [--dataset
    <name> | --dataset-default] [--env <filename> | ] [--git <message> | ] [--mcp] [--nextjs-add-config-files]
    [--nextjs-append-env] [--nextjs-embed-studio] [--organization <id>] [--output-path <path> | ] [--overwrite-files]
    [--package-manager <manager> | ] [--project <id> | --create-project <name>] [--provider <provider>] [--template
    <template> | ] [--typescript | ] [--visibility <mode>] [-y]

FLAGS
  -y, --yes                        Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults
      --[no-]auto-updates          Enable auto updates of studio versions
      --bare                       Skip the Studio initialization and only print the selected project ID and dataset
                                   name to stdout
      --coupon=<code>              Optionally select a coupon for a new project (cannot be used with --project-plan)
      --create-project=<name>      Create a new project with the given name
      --dataset=<name>             Dataset name for the studio
      --dataset-default            Set up a project with a public dataset named "production"
      --env=<filename>             Write environment variables to file
      --[no-]git=<message>         Specify a commit message for initial commit, or disable git init
      --[no-]mcp                   Enable AI editor integration (MCP) setup
      --organization=<id>          Organization ID to use for the project
      --output-path=<path>         Path to write studio project to
      --[no-]overwrite-files       Overwrite existing files
      --package-manager=<manager>  Specify which package manager to use [allowed: npm, yarn, pnpm]
      --project=<id>               Project ID to use for the studio
      --project-plan=<name>        Optionally select a plan for a new project
      --provider=<provider>        Login provider to use
      --template=<template>        Project template to use [default: "clean"]
      --[no-]typescript            Enable TypeScript support
      --visibility=<mode>          Visibility mode for dataset

GLOBAL FLAGS
  --json  Format output as json.

NEXT.JS FLAGS
  --[no-]nextjs-add-config-files  Add config files to Next.js project
  --[no-]nextjs-append-env        Append project ID and dataset to .env file
  --[no-]nextjs-embed-studio      Embed the Studio in Next.js application

DESCRIPTION
  Initialize a new Sanity Studio, project and/or app

EXAMPLES
  $ sanity init

  Initialize a new project with a public dataset named "production"

    $ sanity init --dataset-default

  Initialize a project with the given project ID and dataset to the given path

    $ sanity init -y --project abc123 --dataset production --output-path ~/myproj

  Initialize a project with the given project ID and dataset using the moviedb template to the given path

    $ sanity init -y --project abc123 --dataset staging --template moviedb --output-path .

  Create a brand new project with name "Movies Unlimited"

    $ sanity init -y --create-project "Movies Unlimited" --dataset moviedb --visibility private --template moviedb \
      --output-path /Users/espenh/movies-unlimited
```

_See code: [src/commands/init.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/init.ts)_

## `sanity install [PACKAGES]`

Installs dependencies for Sanity Studio project

```
USAGE
  $ sanity install [PACKAGES...]

ARGUMENTS
  [PACKAGES...]  Packages to install

DESCRIPTION
  Installs dependencies for Sanity Studio project

EXAMPLES
  $ sanity install

  $ sanity install @sanity/vision

  $ sanity install some-package another-package
```

_See code: [src/commands/install.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/install.ts)_

## `sanity learn`

Opens Sanity Learn in your web browser

```
USAGE
  $ sanity learn

DESCRIPTION
  Opens Sanity Learn in your web browser
```

_See code: [src/commands/learn.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/learn.ts)_

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

_See code: [src/commands/login.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/login.ts)_

## `sanity logout`

Logs out the CLI from the current user session

```
USAGE
  $ sanity logout

DESCRIPTION
  Logs out the CLI from the current user session
```

_See code: [src/commands/logout.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/logout.ts)_

## `sanity manage`

Opens project management interface in your web browser

```
USAGE
  $ sanity manage

DESCRIPTION
  Opens project management interface in your web browser
```

_See code: [src/commands/manage.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/manage.ts)_

## `sanity manifest extract`

Extracts the studio configuration as one or more JSON manifest files.

```
USAGE
  $ sanity manifest extract [--path <value>]

FLAGS
  --path=<value>  [default: /dist/static] Optional path to specify destination directory of the manifest files

DESCRIPTION
  Extracts the studio configuration as one or more JSON manifest files.

  **Note**: This command is experimental and subject to change. It is currently intended for use with Create only.

EXAMPLES
  Extracts manifests

    $ sanity manifest extract

  Extracts manifests into /public/static

    $ sanity manifest extract --path /public/static
```

_See code: [src/commands/manifest/extract.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/manifest/extract.ts)_

## `sanity mcp configure`

Configure Sanity MCP server for AI editors (Cursor, VS Code, Claude Code)

```
USAGE
  $ sanity mcp configure

DESCRIPTION
  Configure Sanity MCP server for AI editors (Cursor, VS Code, Claude Code)

EXAMPLES
  Configure Sanity MCP server for detected AI editors

    $ sanity mcp configure
```

_See code: [src/commands/mcp/configure.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/mcp/configure.ts)_

## `sanity media create-aspect`

Create a new aspect definition file

```
USAGE
  $ sanity media create-aspect

DESCRIPTION
  Create a new aspect definition file

EXAMPLES
  Create a new aspect definition file

    $ sanity media create-aspect
```

_See code: [src/commands/media/create-aspect.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/media/create-aspect.ts)_

## `sanity media delete-aspect ASPECTNAME`

Undeploy an aspect

```
USAGE
  $ sanity media delete-aspect ASPECTNAME [--media-library-id <value>] [--yes]

ARGUMENTS
  ASPECTNAME  Name of the aspect to delete

FLAGS
  --media-library-id=<value>  The id of the target media library
  --yes                       Skip confirmation prompt

DESCRIPTION
  Undeploy an aspect

EXAMPLES
  Delete the aspect named "someAspect"

    $ sanity media delete-aspect someAspect
```

_See code: [src/commands/media/delete-aspect.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/media/delete-aspect.ts)_

## `sanity media deploy-aspect [ASPECTNAME]`

Deploy an aspect

```
USAGE
  $ sanity media deploy-aspect [ASPECTNAME] [--all] [--media-library-id <value>]

ARGUMENTS
  [ASPECTNAME]  Name of the aspect to deploy

FLAGS
  --all                       Deploy all aspects
  --media-library-id=<value>  The id of the target media library

DESCRIPTION
  Deploy an aspect

EXAMPLES
  Deploy the aspect named "someAspect"

    $ sanity media deploy-aspect someAspect

  Deploy all aspects

    $ sanity media deploy-aspect --all
```

_See code: [src/commands/media/deploy-aspect.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/media/deploy-aspect.ts)_

## `sanity media export [DESTINATION]`

Export an archive of all file and image assets including their aspect data from the target media library. Video assets are excluded from the export.

```
USAGE
  $ sanity media export [DESTINATION] [--asset-concurrency <value>] [--media-library-id <value>] [--no-compress]
    [--overwrite]

ARGUMENTS
  [DESTINATION]  Output destination file path

FLAGS
  --asset-concurrency=<value>  [default: 8] Concurrent number of asset downloads
  --media-library-id=<value>   The id of the target media library
  --no-compress                Skips compressing tarball entries (still generates a gzip file)
  --overwrite                  Overwrite any file with the same name

DESCRIPTION
  Export an archive of all file and image assets including their aspect data from the target media library. Video assets
  are excluded from the export.

EXAMPLES
  Export media library interactively

    $ sanity media export

  Export media library to output.tar.gz

    $ sanity media export output.tar.gz

  Export specific media library

    $ sanity media export --media-library-id my-library-id
```

_See code: [src/commands/media/export.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/media/export.ts)_

## `sanity media import SOURCE`

Import a set of assets to the target media library.

```
USAGE
  $ sanity media import SOURCE [--media-library-id <value>] [--replace-aspects]

ARGUMENTS
  SOURCE  Image file or folder to import from

FLAGS
  --media-library-id=<value>  The id of the target media library
  --replace-aspects           Replace existing aspect data. All versions will be replaced (e.g. published and draft
                              aspect data)

DESCRIPTION
  Import a set of assets to the target media library.

EXAMPLES
  Import all assets from the "products" directory

    $ sanity media import products

  Import all assets from "gallery" archive

    $ sanity media import gallery.tar.gz

  Import all assets from the "products" directory and replace aspects

    $ sanity media import products --replace-aspects
```

_See code: [src/commands/media/import.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/media/import.ts)_

## `sanity migration create [TITLE]`

Create a new migration within your project

```
USAGE
  $ sanity migration create [TITLE]

ARGUMENTS
  [TITLE]  Title of migration

DESCRIPTION
  Create a new migration within your project

EXAMPLES
  Create a new migration, prompting for title and options

    $ sanity migration create

  Create a new migration with the provided title, prompting for options

    $ sanity migration create "Rename field from location to address"
```

_See code: [@sanity/migrate](https://github.com/sanity-io/migrate/blob/v5.2.2/src/commands/migration/create.ts)_

## `sanity migration list`

List available migrations

```
USAGE
  $ sanity migration list

DESCRIPTION
  List available migrations

EXAMPLES
  List all available migrations in the project

    $ sanity migration list
```

_See code: [@sanity/migrate](https://github.com/sanity-io/migrate/blob/v5.2.2/src/commands/migration/list.ts)_

## `sanity migration run [ID]`

Run a migration against a dataset

```
USAGE
  $ sanity migration run [ID] [--api-version <value>] [--concurrency <value>] [--confirm] [--dataset <value>]
    [--dry-run] [--from-export <value>] [--progress] [--project <value>]

ARGUMENTS
  [ID]  ID

FLAGS
  --api-version=<value>  API version to use when migrating. Defaults to v2024-01-29.
  --concurrency=<value>  [default: 6] How many mutation requests to run in parallel. Must be between 1 and 10. Default:
                         6.
  --[no-]confirm         Prompt for confirmation before running the migration (default: true). Use --no-confirm to skip.
  --dataset=<value>      Dataset to migrate. Defaults to the dataset configured in your Sanity CLI config.
  --[no-]dry-run         By default the migration runs in dry mode. Use --no-dry-run to migrate dataset.
  --from-export=<value>  Use a local dataset export as source for migration instead of calling the Sanity API. Note:
                         this is only supported for dry runs.
  --[no-]progress        Display progress during migration (default: true). Use --no-progress to hide output.
  --project=<value>      Project ID of the dataset to migrate. Defaults to the projectId configured in your Sanity CLI
                         config.

DESCRIPTION
  Run a migration against a dataset

EXAMPLES
  dry run the migration

    $ sanity migration run <id>

  execute the migration against a dataset

    $ sanity migration run <id> --no-dry-run --project xyz --dataset staging

  execute the migration using a dataset export as the source

    $ sanity migration run <id> --from-export=production.tar.gz --no-dry-run --project xyz --dataset staging
```

_See code: [@sanity/migrate](https://github.com/sanity-io/migrate/blob/v5.2.2/src/commands/migration/run.ts)_

## `sanity openapi get SLUG`

Get an OpenAPI specification by slug

```
USAGE
  $ sanity openapi get SLUG [--format yaml|json] [-w]

ARGUMENTS
  SLUG  Slug of the OpenAPI specification to retrieve

FLAGS
  -w, --web              Open in web browser
      --format=<option>  [default: yaml] Output format: yaml (default), json
                         <options: yaml|json>

DESCRIPTION
  Get an OpenAPI specification by slug

EXAMPLES
  Get a specification (YAML format, default)

    $ sanity openapi get query

  Get specification in JSON format

    $ sanity openapi get query --format=json

  Open specification in browser

    $ sanity openapi get query --web

  Pipe to file

    $ sanity openapi get query > query-api.yaml
```

_See code: [src/commands/openapi/get.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/openapi/get.ts)_

## `sanity openapi list`

List all available OpenAPI specifications

```
USAGE
  $ sanity openapi list [--json] [-w]

FLAGS
  -w, --web   Open HTTP Reference in web browser
      --json  Output JSON

DESCRIPTION
  List all available OpenAPI specifications

EXAMPLES
  List all available OpenAPI specs

    $ sanity openapi list

  List with JSON output

    $ sanity openapi list --json

  Open HTTP Reference in browser

    $ sanity openapi list --web
```

_See code: [src/commands/openapi/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/openapi/list.ts)_

## `sanity preview [OUTPUTDIR]`

Starts a server to preview a production build

```
USAGE
  $ sanity preview [OUTPUTDIR] [--host <value>] [--port <value>]

ARGUMENTS
  [OUTPUTDIR]  Output directory

FLAGS
  --host=<value>  [default: localhost] The local network interface at which to listen.
  --port=<value>  [default: 3333] TCP port to start server on.

DESCRIPTION
  Starts a server to preview a production build

ALIASES
  $ sanity start

EXAMPLES
  $ sanity preview --host=0.0.0.0

  $ sanity preview --port=1942

  $ sanity preview some/build-output-dir
```

_See code: [src/commands/preview.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/preview.ts)_

## `sanity projects list`

Lists projects connected to your user

```
USAGE
  $ sanity projects list [--order asc|desc] [--sort id|members|name|url|created]

FLAGS
  --order=<option>  [default: desc]
                    <options: asc|desc>
  --sort=<option>   [default: created]
                    <options: id|members|name|url|created>

DESCRIPTION
  Lists projects connected to your user

EXAMPLES
  List projects

    $ sanity projects list

  List all users of the project, but exclude pending invitations and robots

    $ sanity projects list --sort=members --order=asc
```

_See code: [src/commands/projects/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/projects/list.ts)_

## `sanity schema delete`

Delete schema documents by id

```
USAGE
  $ sanity schema delete --ids <value> [--dataset <value>] [--extract-manifest] [--manifest-dir <value>] [--verbose]

FLAGS
  --dataset=<value>        Delete schemas from a specific dataset
  --[no-]extract-manifest  Generate manifest file (disable with --no-extract-manifest)
  --ids=<value>            (required) Comma-separated list of schema ids to delete
  --manifest-dir=<value>   [default: ./dist/static] Directory containing manifest file
  --verbose                Enable verbose logging

DESCRIPTION
  Delete schema documents by id

EXAMPLES
  Delete a single schema

    $ sanity schema delete --ids sanity.workspace.schema.workspaceName

  Delete multiple schemas

    $ sanity schema delete --ids sanity.workspace.schema.workspaceName,prefix.sanity.workspace.schema.otherWorkspace

  Delete using a pre-existing manifest file (config changes in sanity.config will not be picked up)

    $ sanity schema delete --no-extract-manifest --ids sanity.workspace.schema.workspaceName
```

_See code: [src/commands/schema/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/schema/delete.ts)_

## `sanity schema deploy`

Deploy schema documents into workspace datasets.

```
USAGE
  $ sanity schema deploy [--extract-manifest] [--manifest-dir <directory>] [--tag <tag>] [--verbose] [--workspace
    <name>]

FLAGS
  --[no-]extract-manifest     Disables manifest generation - the command will fail if no manifest exists
  --manifest-dir=<directory>  [default: ./dist/static] Directory containing manifest file
  --tag=<tag>                 Add a tag suffix to the schema id
  --verbose                   Print detailed information during deployment
  --workspace=<name>          The name of the workspace to deploy a schema for

DESCRIPTION
  Deploy schema documents into workspace datasets.

  **Note**: This command is experimental and subject to change.

  This operation (re-)generates a manifest file describing the sanity config workspace by default.
  To re-use an existing manifest file, use --no-extract-manifest.

EXAMPLES
  Deploy all workspace schemas

    $ sanity schema deploy

  Deploy the schema for only the workspace "default"

    $ sanity schema deploy --workspace default

  Runs using a pre-existing manifest file. Config changes in sanity.config will not be picked up in this case.

    $ sanity schema deploy --no-extract-manifest
```

_See code: [src/commands/schema/deploy.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/schema/deploy.ts)_

## `sanity schema extract`

Extracts a JSON representation of a Sanity schema within a Studio context.

```
USAGE
  $ sanity schema extract [--enforce-required-fields] [--format <format>] [--path <value>] [--workspace <name>]

FLAGS
  --enforce-required-fields  Makes the schema generated treat fields marked as required as non-optional
  --format=<format>          [default: groq-type-nodes] Format the schema as GROQ type nodes. Only available format at
                             the moment.
  --path=<value>             Optional path to specify destination of the schema file
  --workspace=<name>         The name of the workspace to generate a schema for

DESCRIPTION
  Extracts a JSON representation of a Sanity schema within a Studio context.

  **Note**: This command is experimental and subject to change.

EXAMPLES
  Extracts schema types in a Sanity project with more than one workspace

    $ sanity schema extract --workspace default
```

_See code: [src/commands/schema/extract.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/schema/extract.ts)_

## `sanity schema list`

Lists all schemas in the current dataset.

```
USAGE
  $ sanity schema list [--extract-manifest] [--id <schema_id>] [--json] [--manifest-dir <directory>]

FLAGS
  --[no-]extract-manifest     Disables manifest generation - the command will fail if no manifest exists
  --id=<schema_id>            Fetch a single schema by id
  --json                      Get schema as json
  --manifest-dir=<directory>  [default: ./dist/static] Directory containing manifest file

DESCRIPTION
  Lists all schemas in the current dataset.

  **Note**: This command is experimental and subject to change.

  This operation (re-)generates a manifest file describing the sanity config workspace by default.
  To re-use an existing manifest file, use --no-extract-manifest.

EXAMPLES
  List all schemas found in any workspace dataset in a table

    $ sanity schema list

  Get a schema for a given id

    $ sanity schema list --id _.schemas.workspaceName

  Get stored schemas as pretty-printed json-array

    $ sanity schema list --json

  Get singular stored schema as pretty-printed json-object

    $ sanity schema list --json --id _.schemas.workspaceName

  Runs using a pre-existing manifest file. Config changes in sanity.config will not be picked up in this case.

    $ sanity schema list --no-extract-manifest
```

_See code: [src/commands/schema/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/schema/list.ts)_

## `sanity schema validate`

Validates all schema types specified in a workspace

```
USAGE
  $ sanity schema validate [--debug-metafile-path <value>] [--format pretty|ndjson|json] [--level error|warning]
    [--workspace <value>]

FLAGS
  --format=<option>    [default: pretty] The output format used to print schema errors and warnings
                       <options: pretty|ndjson|json>
  --level=<option>     [default: warning] The minimum level reported out
                       <options: error|warning>
  --workspace=<value>  The name of the workspace to use when validating all schema types

DEBUG FLAGS
  --debug-metafile-path=<value>  Optional path where a metafile will be written for build analysis. Only written on
                                 successful validation. Can be analyzed at https://esbuild.github.io/analyze/

DESCRIPTION
  Validates all schema types specified in a workspace

EXAMPLES
  Validates all schema types in a Sanity project with more than one workspace

    $ sanity schema validate --workspace default

  Save the results of the report into a file

    $ sanity schema validate > report.txt

  Report out only errors

    $ sanity schema validate --level error

  Generate a report which can be analyzed with https://esbuild.github.io/analyze/

    $ sanity schema validate --debug-metafile-path metafile.json
```

_See code: [src/commands/schema/validate.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/schema/validate.ts)_

## `sanity start [OUTPUTDIR]`

Starts a server to preview a production build

```
USAGE
  $ sanity start [OUTPUTDIR] [--host <value>] [--port <value>]

ARGUMENTS
  [OUTPUTDIR]  Output directory

FLAGS
  --host=<value>  [default: localhost] The local network interface at which to listen.
  --port=<value>  [default: 3333] TCP port to start server on.

DESCRIPTION
  Starts a server to preview a production build

ALIASES
  $ sanity start

EXAMPLES
  $ sanity start --host=0.0.0.0

  $ sanity start --port=1942

  $ sanity start some/build-output-dir
```

## `sanity telemetry disable`

Disable telemetry for your logged in user

```
USAGE
  $ sanity telemetry disable

DESCRIPTION
  Disable telemetry for your logged in user

EXAMPLES
  Disable telemetry for your logged in user

    $ sanity telemetry telemetry disable
```

_See code: [src/commands/telemetry/disable.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/telemetry/disable.ts)_

## `sanity telemetry enable`

Enable telemetry for your logged in user

```
USAGE
  $ sanity telemetry enable

DESCRIPTION
  Enable telemetry for your logged in user

EXAMPLES
  Enable telemetry for your logged in user

    $ sanity telemetry telemetry enable
```

_See code: [src/commands/telemetry/enable.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/telemetry/enable.ts)_

## `sanity telemetry status`

Check telemetry consent status for your logged in user

```
USAGE
  $ sanity telemetry status

DESCRIPTION
  Check telemetry consent status for your logged in user

EXAMPLES
  Check telemetry consent status for your logged in user

    $ sanity telemetry telemetry status
```

_See code: [src/commands/telemetry/status.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/telemetry/status.ts)_

## `sanity tokens add [LABEL]`

Create a new API token for this project

```
USAGE
  $ sanity tokens add [LABEL] [--json] [--role viewer] [-y]

ARGUMENTS
  [LABEL]  Label for the new token

FLAGS
  -y, --yes          Skip prompts and use defaults (unattended mode)
      --json         Output as JSON
      --role=viewer  Role to assign to the token

DESCRIPTION
  Create a new API token for this project

EXAMPLES
  Create a token with a label

    $ sanity tokens add "My API Token"

  Create a token with editor role

    $ sanity tokens add "My API Token" --role=editor

  Create a token in unattended mode

    $ sanity tokens add "CI Token" --role=editor --yes

  Output token information as JSON

    $ sanity tokens add "API Token" --json
```

_See code: [src/commands/tokens/add.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/tokens/add.ts)_

## `sanity tokens delete [TOKENID]`

Delete an API token from this project

```
USAGE
  $ sanity tokens delete [TOKENID] [--yes]

ARGUMENTS
  [TOKENID]  Token ID to delete (will prompt if not provided)

FLAGS
  --yes  Skip confirmation prompt (unattended mode)

DESCRIPTION
  Delete an API token from this project

EXAMPLES
  Interactively select and delete a token

    $ sanity tokens delete

  Delete a specific token by ID

    $ sanity tokens delete silJ2lFmK6dONB

  Delete a specific token without confirmation prompt

    $ sanity tokens delete silJ2lFmK6dONB --yes
```

_See code: [src/commands/tokens/delete.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/tokens/delete.ts)_

## `sanity tokens list`

List API tokens for the current project

```
USAGE
  $ sanity tokens list [--json]

FLAGS
  --json  Output tokens in JSON format

DESCRIPTION
  List API tokens for the current project

EXAMPLES
  List tokens for the current project

    $ sanity tokens list

  List tokens in JSON format

    $ sanity tokens list --json
```

_See code: [src/commands/tokens/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/tokens/list.ts)_

## `sanity undeploy`

Removes the deployed Sanity Studio/App from Sanity hosting

```
USAGE
  $ sanity undeploy [-y]

FLAGS
  -y, --yes  Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults

DESCRIPTION
  Removes the deployed Sanity Studio/App from Sanity hosting
```

_See code: [src/commands/undeploy.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/undeploy.ts)_

## `sanity users invite [EMAIL]`

Invite a new user to the project

```
USAGE
  $ sanity users invite [EMAIL] [--role <value>]

ARGUMENTS
  [EMAIL]  Email address to invite

FLAGS
  --role=<value>  Role to invite the user as

DESCRIPTION
  Invite a new user to the project

EXAMPLES
  Invite a new user to the project (prompt for details)

    $ sanity users invite

  Send a new user invite to the email "pippi@sanity.io", prompt for role

    $ sanity users invite pippi@sanity.io

  Send a new user invite to the email "pippi@sanity.io", as administrator

    $ sanity users invite pippi@sanity.io --role administrator
```

_See code: [src/commands/users/invite.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/users/invite.ts)_

## `sanity users list`

List all users of the project

```
USAGE
  $ sanity users list [--invitations] [--order asc|desc] [--robots] [--sort id|name|role|date]

FLAGS
  --[no-]invitations  Includes or excludes pending invitations
  --order=<option>    [default: asc] Sort output ascending/descending
                      <options: asc|desc>
  --[no-]robots       Includes or excludes robots (token users)
  --sort=<option>     [default: date] Sort users by specified column
                      <options: id|name|role|date>

DESCRIPTION
  List all users of the project

EXAMPLES
  List all users of the project

    $ sanity users list

  List all users of the project, but exclude pending invitations and robots

    $ sanity users list --no-invitations --no-robots

  List all users, sorted by role

    $ sanity users list --sort role
```

_See code: [src/commands/users/list.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/users/list.ts)_

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

_See code: [src/commands/versions.ts](https://github.com/sanity-io/cli/blob/v6.0.0-alpha.7/src/commands/versions.ts)_

<!-- commandsstop -->
