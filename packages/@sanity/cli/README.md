# @sanity/cli

Code for sanity cli

<!-- toc -->

- [@sanity/cli](#sanitycli)
- [Commands](#commands)
<!-- tocstop -->

# Commands

  <!-- commands -->

- [`sanity backups disable [DATASET]`](#sanity-backups-disable-dataset)
- [`sanity backups download [DATASET]`](#sanity-backups-download-dataset)
- [`sanity backups enable [DATASET]`](#sanity-backups-enable-dataset)
- [`sanity backups list [DATASET]`](#sanity-backups-list-dataset)
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
- [`sanity datasets alias create [ALIASNAME] [TARGETDATASET]`](#sanity-datasets-alias-create-aliasname-targetdataset)
- [`sanity datasets alias delete ALIASNAME`](#sanity-datasets-alias-delete-aliasname)
- [`sanity datasets alias link [ALIASNAME] [TARGETDATASET]`](#sanity-datasets-alias-link-aliasname-targetdataset)
- [`sanity datasets alias unlink [ALIASNAME]`](#sanity-datasets-alias-unlink-aliasname)
- [`sanity datasets copy [SOURCE] [TARGET]`](#sanity-datasets-copy-source-target)
- [`sanity datasets create [NAME]`](#sanity-datasets-create-name)
- [`sanity datasets delete DATASETNAME`](#sanity-datasets-delete-datasetname)
- [`sanity datasets embeddings disable [DATASET]`](#sanity-datasets-embeddings-disable-dataset)
- [`sanity datasets embeddings enable [DATASET]`](#sanity-datasets-embeddings-enable-dataset)
- [`sanity datasets embeddings status [DATASET]`](#sanity-datasets-embeddings-status-dataset)
- [`sanity datasets export [NAME] [DESTINATION]`](#sanity-datasets-export-name-destination)
- [`sanity datasets import SOURCE [TARGETDATASET]`](#sanity-datasets-import-source-targetdataset)
- [`sanity datasets list`](#sanity-datasets-list)
- [`sanity datasets visibility get DATASET`](#sanity-datasets-visibility-get-dataset)
- [`sanity datasets visibility set DATASET MODE`](#sanity-datasets-visibility-set-dataset-mode)
- [`sanity debug`](#sanity-debug)
- [`sanity deploy [SOURCEDIR]`](#sanity-deploy-sourcedir)
- [`sanity dev`](#sanity-dev)
- [`sanity docs browse`](#sanity-docs-browse)
- [`sanity docs read PATH`](#sanity-docs-read-path)
- [`sanity docs search QUERY`](#sanity-docs-search-query)
- [`sanity doctor [CHECKS]`](#sanity-doctor-checks)
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
- [`sanity graphql deploy`](#sanity-graphql-deploy)
- [`sanity graphql list`](#sanity-graphql-list)
- [`sanity graphql undeploy`](#sanity-graphql-undeploy)
- [`sanity help [COMMAND]`](#sanity-help-command)
- [`sanity hooks attempt ATTEMPTID`](#sanity-hooks-attempt-attemptid)
- [`sanity hooks create`](#sanity-hooks-create)
- [`sanity hooks delete [NAME]`](#sanity-hooks-delete-name)
- [`sanity hooks list`](#sanity-hooks-list)
- [`sanity hooks logs [NAME]`](#sanity-hooks-logs-name)
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
- [`sanity migrations create [TITLE]`](#sanity-migrations-create-title)
- [`sanity migrations list`](#sanity-migrations-list)
- [`sanity migrations run [ID]`](#sanity-migrations-run-id)
- [`sanity openapi get SLUG`](#sanity-openapi-get-slug)
- [`sanity openapi list`](#sanity-openapi-list)
- [`sanity preview [OUTPUTDIR]`](#sanity-preview-outputdir)
- [`sanity projects create [PROJECTNAME]`](#sanity-projects-create-projectname)
- [`sanity projects list`](#sanity-projects-list)
- [`sanity schemas delete`](#sanity-schemas-delete)
- [`sanity schemas deploy`](#sanity-schemas-deploy)
- [`sanity schemas extract`](#sanity-schemas-extract)
- [`sanity schemas list`](#sanity-schemas-list)
- [`sanity schemas validate`](#sanity-schemas-validate)
- [`sanity telemetry disable`](#sanity-telemetry-disable)
- [`sanity telemetry enable`](#sanity-telemetry-enable)
- [`sanity telemetry status`](#sanity-telemetry-status)
- [`sanity tokens add [LABEL]`](#sanity-tokens-add-label)
- [`sanity tokens delete [TOKENID]`](#sanity-tokens-delete-tokenid)
- [`sanity tokens list`](#sanity-tokens-list)
- [`sanity typegen generate`](#sanity-typegen-generate)
- [`sanity undeploy`](#sanity-undeploy)
- [`sanity users invite [EMAIL]`](#sanity-users-invite-email)
- [`sanity users list`](#sanity-users-list)
- [`sanity versions`](#sanity-versions)

## `sanity backups disable [DATASET]`

Disable backup for a dataset

```
USAGE
  $ sanity backups disable [DATASET] [-p <id>]

ARGUMENTS
  [DATASET]  Dataset name to disable backup for

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to disable backups for (overrides CLI configuration)

DESCRIPTION
  Disable backup for a dataset

EXAMPLES
  Interactively disable backup for a dataset

    $ sanity backups disable

  Disable backup for the production dataset

    $ sanity backups disable production
```

## `sanity backups download [DATASET]`

Download a dataset backup to a local file

```
USAGE
  $ sanity backups download [DATASET] [-p <id>] [--backup-id <value>] [--concurrency <value>] [--out <value>]
    [--overwrite]

ARGUMENTS
  [DATASET]  Dataset name to download backup from

FLAGS
  --backup-id=<value>    The backup ID to download
  --concurrency=<value>  [default: 10] Concurrent number of backup item downloads (max: 24)
  --out=<value>          The file or directory path the backup should download to
  --overwrite            Allows overwriting of existing backup file

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to download backup from (overrides CLI configuration)

DESCRIPTION
  Download a dataset backup to a local file

EXAMPLES
  Interactively download a backup

    $ sanity backups download

  Download a specific backup for the production dataset

    $ sanity backups download production --backup-id 2024-01-01-backup-1

  Download backup to a specific file

    $ sanity backups download production --backup-id 2024-01-01-backup-2 --out /path/to/file

  Download backup and overwrite existing file

    $ sanity backups download production --backup-id 2024-01-01-backup-3 --out /path/to/file --overwrite
```

## `sanity backups enable [DATASET]`

Enable backup for a dataset

```
USAGE
  $ sanity backups enable [DATASET] [-p <id>]

ARGUMENTS
  [DATASET]  Dataset name to enable backup for

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to enable backups for (overrides CLI configuration)

DESCRIPTION
  Enable backup for a dataset

EXAMPLES
  Interactively enable backup for a dataset

    $ sanity backups enable

  Enable backup for the production dataset

    $ sanity backups enable production
```

## `sanity backups list [DATASET]`

List available backups for a dataset

```
USAGE
  $ sanity backups list [DATASET] [-p <id>] [--after <value>] [--before <value>] [-l <value>]

ARGUMENTS
  [DATASET]  Dataset name to list backups for

FLAGS
  -l, --limit=<value>   [default: 30] Maximum number of backups returned
      --after=<value>   Only return backups after this date (inclusive, YYYY-MM-DD format)
      --before=<value>  Only return backups before this date (exclusive, YYYY-MM-DD format)

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list backups for (overrides CLI configuration)

DESCRIPTION
  List available backups for a dataset

EXAMPLES
  List backups for a dataset interactively

    $ sanity backups list

  List backups for the production dataset

    $ sanity backups list production

  List up to 50 backups for the production dataset

    $ sanity backups list production --limit 50

  List up to 10 backups created after 2024-01-31

    $ sanity backups list production --after 2024-01-31 --limit 10
```

## `sanity blueprints add TYPE`

Add a function resource to a Blueprint

```
USAGE
  $ sanity blueprints add TYPE [--example <value> | -n <value> | --fn-type
    document-publish|document-create|document-update|document-delete|media-library-asset-create|media-library-asset-upda
    te|media-library-asset-delete|scheduled-function... | --language ts|js | --javascript | --fn-helpers |
    --fn-installer skip|npm|pnpm|yarn] [-i | ]

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
                               <options: document-publish|document-create|document-update|document-delete|media-library-
                               asset-create|media-library-asset-update|media-library-asset-delete|scheduled-function>
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

## `sanity blueprints config`

View or edit the local Blueprint configuration

```
USAGE
  $ sanity blueprints config [--project-id <value> -e] [--stack <value> ]

FLAGS
  -e, --edit                Modify the configuration interactively, or directly when combined with ID flags.
      --project-id=<value>  Directly set the project ID in the configuration. Requires --edit flag
      --stack=<value>       Stack name or ID to set in the configuration. Requires --edit flag

DESCRIPTION
  View or edit the local Blueprint configuration

  Manages the local Blueprint configuration, which links your Blueprint to a Sanity project and Stack.

  Without flags, displays the current configuration. Use --edit to interactively modify settings, or combine --edit with
  ID flags to update values directly (useful for scripting and automation).

  If you need to switch your Blueprint to a different Stack, use --edit --stack.

EXAMPLES
  $ sanity blueprints config

  $ sanity blueprints config --edit

  $ sanity blueprints config --edit --project-id <projectId>

  $ sanity blueprints config --edit --project-id <projectId> --stack <name-or-id>
```

## `sanity blueprints deploy`

Deploy the local Blueprint to the remote Stack

```
USAGE
  $ sanity blueprints deploy [--stack <value>] [--no-wait]

FLAGS
  --no-wait        Do not wait for Stack deployment to complete
  --stack=<value>  Stack name or ID to use instead of the locally configured Stack

DESCRIPTION
  Deploy the local Blueprint to the remote Stack

  Pushes your local Blueprint configuration to the remote Stack; provisioning, updating, or destroying resources as
  needed. This is the primary command for applying infrastructure changes.

  Before deploying, run 'blueprints plan' to preview changes. After deployment, use 'blueprints info' to verify Stack
  status or 'blueprints logs' to monitor activity.

  Use --no-wait to queue the deployment and return immediately without waiting for completion.

  Use --fn-installer to force which package manager to use when deploying functions.

  Set SANITY_ASSET_TIMEOUT (seconds) to override the 60-second timeout for processing resource assets.

EXAMPLES
  $ sanity blueprints deploy

  $ sanity blueprints deploy --no-wait

  $ sanity blueprints deploy --fn-installer npm
```

## `sanity blueprints destroy`

Destroy the remote Stack deployment and its resources (will not delete local files)

```
USAGE
  $ sanity blueprints destroy [--project-id <value> --stack <value> --force] [--no-wait]

FLAGS
  --force               Force Stack destruction (skip confirmation)
  --no-wait             Do not wait for Stack destruction to complete
  --project-id=<value>  Project associated with the Stack
  --stack=<value>       Stack name or ID to destroy (defaults to the locally configured Stack)

DESCRIPTION
  Destroy the remote Stack deployment and its resources (will not delete local files)

  Permanently removes the remote Stack and all its provisioned resources. Your local Blueprint files remain untouched,
  allowing you to redeploy later with 'blueprints init' + 'blueprints deploy'.

  This is a destructive operation. You will be prompted to confirm unless --force is specified.

  Use this to clean up test environments or decommission a Stack you no longer need.

EXAMPLES
  $ sanity blueprints destroy

  $ sanity blueprints destroy --stack <name-or-id> --project-id <projectId> --force --no-wait
```

## `sanity blueprints doctor`

Diagnose potential issues with local Blueprint and remote Stack configuration

```
USAGE
  $ sanity blueprints doctor [--json] [-p <value>] [--verbose] [--fix]

FLAGS
  -p, --path=<value>  [env: SANITY_BLUEPRINT_PATH] Path to a Blueprint file or directory containing one
      --fix           Interactively fix configuration issues
      --json          Format output as json.
      --[no-]verbose  Verbose output; defaults to true

DESCRIPTION
  Diagnose potential issues with local Blueprint and remote Stack configuration

  Analyzes your local Blueprint and remote Stack configuration for common issues, such as missing authentication,
  invalid project references, or misconfigured resources.

  Run this command when encountering errors with other Blueprint commands. Use --fix to interactively resolve detected
  issues.
```

## `sanity blueprints info`

Show information about the local Blueprint's remote Stack deployment

```
USAGE
  $ sanity blueprints info [--stack <value>]

FLAGS
  --stack=<value>  Stack name or ID to use instead of the locally configured Stack

DESCRIPTION
  Show information about the local Blueprint's remote Stack deployment

  Displays the current state and metadata of your remote Stack deployment, including deployed resources, status, and
  configuration.

  Use this command to verify a deployment succeeded, check what resources are live, or confirm which Stack your local
  Blueprint is connected to.

  Run 'blueprints stacks' to see all available Stacks in your project or organization.

EXAMPLES
  $ sanity blueprints info

  $ sanity blueprints info --stack <name-or-id>
```

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

## `sanity blueprints logs`

Display logs for the current Blueprint's Stack deployment

```
USAGE
  $ sanity blueprints logs [--stack <value>] [-w]

FLAGS
  -w, --watch          Watch for new Stack logs (streaming mode)
      --stack=<value>  Stack name or ID to use instead of the locally configured Stack

DESCRIPTION
  Display logs for the current Blueprint's Stack deployment

  Retrieves Stack deployment logs, useful for debugging and monitoring deployment activity.

  Use --watch (-w) to stream logs in real-time.

  If you're not seeing expected logs, verify your Stack is deployed with 'blueprints info'.

EXAMPLES
  $ sanity blueprints logs

  $ sanity blueprints logs --watch
```

## `sanity blueprints plan`

Enumerate resources to be deployed to the remote Stack - will not modify any resources

```
USAGE
  $ sanity blueprints plan [--stack <value>]

FLAGS
  --stack=<value>  Stack name or ID to use instead of the locally configured Stack

DESCRIPTION
  Enumerate resources to be deployed to the remote Stack - will not modify any resources

  Use this command to preview what changes will be applied to your remote Stack before deploying. This is a safe,
  read-only operation—no resources are created, modified, or deleted.

  Run 'blueprints plan' after making local changes to your Blueprint manifest to verify the expected diff. When ready,
  run 'blueprints deploy' to apply changes.

EXAMPLES
  $ sanity blueprints plan
```

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

## `sanity build [OUTPUTDIR]`

Build Sanity Studio into a static bundle

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
  Build Sanity Studio into a static bundle

EXAMPLES
  $ sanity build

  $ sanity build --no-minify --source-maps
```

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

## `sanity cors add ORIGIN`

Add a CORS origin to the project

```
USAGE
  $ sanity cors add ORIGIN [-p <id>] [--credentials]

ARGUMENTS
  ORIGIN  Origin to allow (e.g., https://example.com)

FLAGS
  --[no-]credentials  Allow credentials (token/cookie) to be sent from this origin

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to add CORS origin to (overrides CLI configuration)

DESCRIPTION
  Add a CORS origin to the project

EXAMPLES
  Interactively add a CORS origin

    $ sanity cors add

  Add a localhost origin without credentials

    $ sanity cors add http://localhost:3000 --no-credentials

  Add a production origin with credentials allowed

    $ sanity cors add https://myapp.com --credentials

  Add a CORS origin for a specific project

    $ sanity cors add https://myapp.com --project-id abc123
```

## `sanity cors delete [ORIGIN]`

Delete a CORS origin from the project

```
USAGE
  $ sanity cors delete [ORIGIN] [-p <id>]

ARGUMENTS
  [ORIGIN]  Origin to delete (will prompt if not provided)

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete CORS origin from (overrides CLI configuration)

DESCRIPTION
  Delete a CORS origin from the project

EXAMPLES
  Interactively select and delete a CORS origin

    $ sanity cors delete

  Delete a specific CORS origin

    $ sanity cors delete https://example.com

  Delete a CORS origin from a specific project

    $ sanity cors delete --project-id abc123
```

## `sanity cors list`

List CORS origins for the project

```
USAGE
  $ sanity cors list [-p <id>]

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list CORS origins for (overrides CLI configuration)

DESCRIPTION
  List CORS origins for the project

EXAMPLES
  List CORS origins for the project

    $ sanity cors list

  List CORS origins for a specific project

    $ sanity cors list --project-id abc123
```

## `sanity datasets alias create [ALIASNAME] [TARGETDATASET]`

Create a dataset alias for the project

```
USAGE
  $ sanity datasets alias create [ALIASNAME] [TARGETDATASET] [-p <id>]

ARGUMENTS
  [ALIASNAME]      Dataset alias name to create
  [TARGETDATASET]  Target dataset name to link the alias to

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to create dataset alias in (overrides CLI configuration)

DESCRIPTION
  Create a dataset alias for the project

EXAMPLES
  Create alias in a specific project

    $ sanity datasets alias create --project-id abc123 conference conf-2025

  Create an alias with interactive prompts

    $ sanity datasets alias create

  Create alias named "conference" with interactive dataset selection

    $ sanity datasets alias create conference

  Create alias "conference" linked to "conf-2025" dataset

    $ sanity datasets alias create conference conf-2025
```

## `sanity datasets alias delete ALIASNAME`

Delete a dataset alias from the project

```
USAGE
  $ sanity datasets alias delete ALIASNAME [-p <id>] [--force]

ARGUMENTS
  ALIASNAME  Dataset alias name to delete

FLAGS
  --force  Skip confirmation prompt and delete immediately

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete dataset alias from (overrides CLI configuration)

DESCRIPTION
  Delete a dataset alias from the project

EXAMPLES
  Delete alias named "conference" with confirmation prompt

    $ sanity datasets alias delete conference

  Delete alias named "conference" without confirmation prompt

    $ sanity datasets alias delete conference --force
```

## `sanity datasets alias link [ALIASNAME] [TARGETDATASET]`

Link a dataset alias to a dataset in the project

```
USAGE
  $ sanity datasets alias link [ALIASNAME] [TARGETDATASET] [-p <id>] [--force]

ARGUMENTS
  [ALIASNAME]      Dataset alias name to link
  [TARGETDATASET]  Target dataset name to link the alias to

FLAGS
  --force  Skip confirmation prompt when relinking existing alias

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to link dataset alias in (overrides CLI configuration)

DESCRIPTION
  Link a dataset alias to a dataset in the project

EXAMPLES
  Link an alias with interactive prompts

    $ sanity datasets alias link

  Link alias named "conference" with interactive dataset selection

    $ sanity datasets alias link conference

  Link alias "conference" to "conf-2025" dataset

    $ sanity datasets alias link conference conf-2025

  Force link without confirmation (skip relink prompt)

    $ sanity datasets alias link conference conf-2025 --force
```

## `sanity datasets alias unlink [ALIASNAME]`

Unlink a dataset alias from its dataset in the project

```
USAGE
  $ sanity datasets alias unlink [ALIASNAME] [-p <id>] [--force]

ARGUMENTS
  [ALIASNAME]  Dataset alias name to unlink

FLAGS
  --force  Skip confirmation prompt and unlink immediately

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to unlink dataset alias in (overrides CLI configuration)

DESCRIPTION
  Unlink a dataset alias from its dataset in the project

EXAMPLES
  Unlink an alias with interactive selection

    $ sanity datasets alias unlink

  Unlink alias "conference" with confirmation prompt

    $ sanity datasets alias unlink conference

  Unlink alias "conference" without confirmation prompt

    $ sanity datasets alias unlink conference --force
```

## `sanity datasets copy [SOURCE] [TARGET]`

Copy a dataset or manage copy jobs

```
USAGE
  $ sanity datasets copy [SOURCE] [TARGET] [-p <id>] [--attach <value> | --list | --detach | --skip-history]
    [--limit <value> ] [--offset <value> ]

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

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to copy dataset in (overrides CLI configuration)

DESCRIPTION
  Copy a dataset or manage copy jobs

EXAMPLES
  Interactively copy a dataset

    $ sanity datasets copy

  Copy from source-dataset (prompts for target)

    $ sanity datasets copy source-dataset

  Copy from source-dataset to target-dataset

    $ sanity datasets copy source-dataset target-dataset

  Copy without preserving document history (faster for large datasets)

    $ sanity datasets copy --skip-history source target

  Start copy job without waiting for completion

    $ sanity datasets copy --detach source target

  Attach to a running copy job to follow progress

    $ sanity datasets copy --attach <job-id>

  List all dataset copy jobs

    $ sanity datasets copy --list

  List copy jobs with pagination

    $ sanity datasets copy --list --offset 2 --limit 10
```

## `sanity datasets create [NAME]`

Create a new dataset for the project

```
USAGE
  $ sanity datasets create [NAME] [-p <id>] [--embeddings-projection <value> --embeddings] [--visibility
    custom|private|public]

ARGUMENTS
  [NAME]  Name of the dataset to create

FLAGS
  --embeddings                     Enable embeddings for this dataset
  --embeddings-projection=<value>  GROQ projection for embeddings indexing (e.g. "{ title, body }")
  --visibility=<option>            Set visibility for this dataset (custom/private/public)
                                   <options: custom|private|public>

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to create dataset in (overrides CLI configuration)

DESCRIPTION
  Create a new dataset for the project

EXAMPLES
  Interactively create a dataset

    $ sanity datasets create

  Create a dataset named "my-dataset"

    $ sanity datasets create my-dataset

  Create a private dataset named "my-dataset"

    $ sanity datasets create my-dataset --visibility private
```

## `sanity datasets delete DATASETNAME`

Delete a dataset from the project

```
USAGE
  $ sanity datasets delete DATASETNAME [-p <id>] [--force]

ARGUMENTS
  DATASETNAME  Dataset name to delete

FLAGS
  --force  Do not prompt for delete confirmation - forcefully delete

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete dataset from (overrides CLI configuration)

DESCRIPTION
  Delete a dataset from the project

EXAMPLES
  Delete a specific dataset

    $ sanity datasets delete my-dataset

  Delete a specific dataset without confirmation

    $ sanity datasets delete my-dataset --force
```

## `sanity datasets embeddings disable [DATASET]`

Disable embeddings for a dataset

```
USAGE
  $ sanity datasets embeddings disable [DATASET] [-p <id>]

ARGUMENTS
  [DATASET]  Dataset name to disable embeddings for

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to disable embeddings for (overrides CLI configuration)

DESCRIPTION
  Disable embeddings for a dataset

EXAMPLES
  Disable embeddings for the production dataset

    $ sanity datasets embeddings disable production
```

## `sanity datasets embeddings enable [DATASET]`

Enable embeddings for a dataset

```
USAGE
  $ sanity datasets embeddings enable [DATASET] [-p <id>] [--projection <value>] [--wait]

ARGUMENTS
  [DATASET]  Dataset name to enable embeddings for

FLAGS
  --projection=<value>  GROQ projection defining which fields to embed (e.g. "{ title, body }")
  --wait                Wait for embeddings processing to complete before returning

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to enable embeddings for (overrides CLI configuration)

DESCRIPTION
  Enable embeddings for a dataset

EXAMPLES
  Enable embeddings for the production dataset

    $ sanity datasets embeddings enable production

  Enable embeddings with a specific projection

    $ sanity datasets embeddings enable production --projection "{ title, body }"

  Enable embeddings and wait for processing to complete

    $ sanity datasets embeddings enable production --wait
```

## `sanity datasets embeddings status [DATASET]`

Show embeddings settings and status for a dataset

```
USAGE
  $ sanity datasets embeddings status [DATASET] [-p <id>]

ARGUMENTS
  [DATASET]  The name of the dataset to check embeddings status for

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to check embeddings status for (overrides CLI configuration)

DESCRIPTION
  Show embeddings settings and status for a dataset

EXAMPLES
  Show embeddings status for the production dataset

    $ sanity datasets embeddings status production
```

## `sanity datasets export [NAME] [DESTINATION]`

Export a dataset to a local gzipped tarball. Assets returning 401, 403, or 404 are excluded from the export.

```
USAGE
  $ sanity datasets export [NAME] [DESTINATION] [-p <id>] [--asset-concurrency <value>] [--mode stream|cursor]
    [--no-assets] [--no-compress] [--no-drafts] [--overwrite] [--raw] [--types <value>]

ARGUMENTS
  [NAME]         Name of the dataset to export
  [DESTINATION]  Output destination file path

FLAGS
  --asset-concurrency=<value>  [default: 8] Concurrent number of asset downloads
  --mode=<option>              [default: stream] Export mode ('cursor' is faster for large datasets but may miss
                               concurrent changes)
                               <options: stream|cursor>
  --no-assets                  Export only non-asset documents and remove references to image assets
  --no-compress                Skips compressing tarball entries (still generates a gzip file)
  --no-drafts                  Export only published versions of documents
  --overwrite                  Overwrite any file with the same name
  --raw                        Extract only documents, without rewriting asset references
  --types=<value>              Defines which document types to export (comma-separated)

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to export dataset from (overrides CLI configuration)

DESCRIPTION
  Export a dataset to a local gzipped tarball. Assets returning 401, 403, or 404 are excluded from the export.

EXAMPLES
  Export dataset "moviedb" to localPath.tar.gz

    $ sanity datasets export moviedb localPath.tar.gz

  Export dataset without assets

    $ sanity datasets export moviedb assetless.tar.gz --no-assets

  Export raw documents without asset reference rewriting

    $ sanity datasets export staging staging.tar.gz --raw

  Export specific document types

    $ sanity datasets export staging staging.tar.gz --types products,shops
```

## `sanity datasets import SOURCE [TARGETDATASET]`

Import documents to a Sanity dataset

```
USAGE
  $ sanity datasets import SOURCE [TARGETDATASET] [--allow-assets-in-different-dataset] [--allow-failing-assets]
    [--allow-replacement-characters] [--allow-system-documents] [--asset-concurrency <value>] [-d <name>] [--missing |
    --replace] [-p <id>] [--replace-assets] [--skip-cross-dataset-references] [-t <value>]

ARGUMENTS
  SOURCE           Source file (use "-" for stdin)
  [TARGETDATASET]  Target dataset (prefer --dataset flag instead)

FLAGS
  -d, --dataset=<name>                     Dataset to import to
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

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to import to (overrides CLI configuration)

DESCRIPTION
  Import documents to a Sanity dataset

EXAMPLES
  Import "./my-dataset.ndjson" into dataset "staging"

    $ sanity datasets import -d staging my-dataset.ndjson

  Import into dataset "test" from stdin

    cat my-dataset.ndjson | sanity datasets import -d test -

  Import with explicit project ID (overrides CLI configuration)

    $ sanity datasets import -p projectId -d staging my-dataset.ndjson

  Import with an explicit token (e.g. for CI/CD)

    $ sanity datasets import -d staging -t someSecretToken my-dataset.ndjson
```

## `sanity datasets list`

List datasets for the project

```
USAGE
  $ sanity datasets list [-p <id>]

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list datasets for (overrides CLI configuration)

DESCRIPTION
  List datasets for the project

EXAMPLES
  List datasets for the project

    $ sanity datasets list

  List datasets for a specific project

    $ sanity datasets list --project-id abc123
```

## `sanity datasets visibility get DATASET`

Get the visibility of a dataset

```
USAGE
  $ sanity datasets visibility get DATASET [-p <id>]

ARGUMENTS
  DATASET  The name of the dataset to get visibility for

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to get dataset visibility for (overrides CLI configuration)

DESCRIPTION
  Get the visibility of a dataset

EXAMPLES
  Check the visibility of a dataset

    $ sanity datasets visibility get my-dataset
```

## `sanity datasets visibility set DATASET MODE`

Set the visibility of a dataset

```
USAGE
  $ sanity datasets visibility set DATASET MODE [-p <id>]

ARGUMENTS
  DATASET  The name of the dataset to set visibility for
  MODE     (public|private) The visibility mode to set

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to set dataset visibility for (overrides CLI configuration)

DESCRIPTION
  Set the visibility of a dataset

EXAMPLES
  Make a dataset private

    $ sanity datasets visibility set my-dataset private

  Make a dataset public

    $ sanity datasets visibility set my-dataset public
```

## `sanity debug`

Print diagnostic info for troubleshooting

```
USAGE
  $ sanity debug [--secrets] [--verbose]

FLAGS
  --secrets  Include API keys in output
  --verbose  Show full error details including stack traces

DESCRIPTION
  Print diagnostic info for troubleshooting

EXAMPLES
  $ sanity debug

  $ sanity debug --secrets
```

## `sanity deploy [SOURCEDIR]`

Builds and deploys Sanity Studio or application to Sanity hosting

```
USAGE
  $ sanity deploy [SOURCEDIR] [--auto-updates] [--external | --source-maps | --minify | --build]
    [--schema-required] [--url <value>] [--verbose] [-y]

ARGUMENTS
  [SOURCEDIR]  Source directory

FLAGS
  -y, --yes                Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults
      --[no-]auto-updates  Automatically update the studio to the latest version
      --[no-]build         Build the studio before deploying (use --no-build to deploy existing `dist/` output)
      --external           Register an externally hosted studio
      --[no-]minify        Minify built JavaScript (use --no-minify to skip for faster builds)
      --schema-required    Fail if schema deployment fails
      --source-maps        Enable source maps for built bundles (increases size of bundle)
      --url=<value>        Studio URL for deployment. For external studios, the full URL. For hosted studios, the
                           hostname (e.g. "my-studio" or "my-studio.sanity.studio")
      --verbose            Enable verbose logging

DESCRIPTION
  Builds and deploys Sanity Studio or application to Sanity hosting

EXAMPLES
  Build and deploy the studio to Sanity hosting

    $ sanity deploy

  Deploys non-minified build with source maps

    $ sanity deploy --no-minify --source-maps

  Fail fast on schema store fails - for when other services rely on the stored schema

    $ sanity deploy --schema-required

  Register an externally hosted studio (studioHost contains full URL)

    $ sanity deploy --external
```

## `sanity dev`

Start a local development server with live reloading

```
USAGE
  $ sanity dev [--auto-updates] [--host <value>] [--load-in-dashboard] [--port <value>]

FLAGS
  --[no-]auto-updates       Automatically update Sanity Studio dependencies
  --host=<value>            Local network interface to listen on (default: localhost)
  --[no-]load-in-dashboard  Load the app/studio in the Sanity dashboard
  --port=<value>            TCP port to start server on (default: 3333)

DESCRIPTION
  Start a local development server with live reloading

EXAMPLES
  $ sanity dev --host=0.0.0.0

  $ sanity dev --port=1942

  $ sanity dev --load-in-dashboard
```

## `sanity docs browse`

Open Sanity docs in your browser

```
USAGE
  $ sanity docs browse

DESCRIPTION
  Open Sanity docs in your browser
```

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

## `sanity doctor [CHECKS]`

Run diagnostics on your Sanity project

```
USAGE
  $ sanity doctor [CHECKS...] [-j]

ARGUMENTS
  [CHECKS...]  Checks to enable (defaults to all). Valid: cli

FLAGS
  -j, --json  Output results as JSON

DESCRIPTION
  Run diagnostics on your Sanity project

EXAMPLES
  $ sanity doctor

  Output results as JSON

    $ sanity doctor --json

  Only run CLI-related diagnostics

    $ sanity doctor cli
```

## `sanity documents create [FILE]`

Create one or more documents

```
USAGE
  $ sanity documents create [FILE] [-p <id>] [-d <name>] [--id <value>] [--json5] [--missing] [--replace] [--watch]

ARGUMENTS
  [FILE]  JSON file to create document(s) from

FLAGS
  --id=<value>  Specify a document ID to use. Will fetch remote document ID and populate editor.
  --json5       Use JSON5 file type to allow a "simplified" version of JSON
  --missing     On duplicate document IDs, don't modify the target document(s)
  --replace     On duplicate document IDs, replace existing document with specified document(s)
  --watch       Write the documents whenever the target file or buffer changes

OVERRIDE FLAGS
  -d, --dataset=<name>   Dataset to create document(s) in (overrides CLI configuration)
  -p, --project-id=<id>  Project ID to create document(s) in (overrides CLI configuration)

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

  Create documents in a specific project

    $ sanity documents create myDocument.json --project-id abc123
```

## `sanity documents delete ID [IDS]`

Delete one or more documents from the project's configured dataset

```
USAGE
  $ sanity documents delete ID... [IDS...] [-p <id>] [-d <name>]

ARGUMENTS
  ID...     Document ID to delete
  [IDS...]  Additional document IDs to delete

OVERRIDE FLAGS
  -d, --dataset=<name>   Dataset to delete from (overrides CLI configuration)
  -p, --project-id=<id>  Project ID to delete from (overrides CLI configuration)

DESCRIPTION
  Delete one or more documents from the project's configured dataset

EXAMPLES
  Delete the document with the ID "myDocId"

    $ sanity documents delete myDocId

  ID wrapped in double or single quote works equally well

    $ sanity documents delete 'myDocId'

  Delete document with ID "someDocId" from dataset "blog"

    $ sanity documents delete --dataset=blog someDocId

  Delete the document with ID "doc1" and "doc2"

    $ sanity documents delete doc1 doc2

  Delete a document from a specific project

    $ sanity documents delete myDocId --project-id abc123
```

## `sanity documents get DOCUMENTID`

Get and print a document by ID

```
USAGE
  $ sanity documents get DOCUMENTID [-p <id>] [-d <name>] [--pretty]

ARGUMENTS
  DOCUMENTID  Document ID to retrieve

FLAGS
  --pretty  Colorize JSON output

OVERRIDE FLAGS
  -d, --dataset=<name>   Dataset to get document from (overrides CLI configuration)
  -p, --project-id=<id>  Project ID to get document from (overrides CLI configuration)

DESCRIPTION
  Get and print a document by ID

EXAMPLES
  Get the document with ID "myDocId"

    $ sanity documents get myDocId

  Get document with colorized JSON output

    $ sanity documents get myDocId --pretty

  Get document from a specific dataset

    $ sanity documents get myDocId --dataset production

  Get a document from a specific project

    $ sanity documents get myDocId --project-id abc123
```

## `sanity documents query QUERY`

Query for documents

```
USAGE
  $ sanity documents query QUERY [-p <id>] [-d <name>] [--anonymous] [--api-version <value>] [--pretty]

ARGUMENTS
  QUERY  GROQ query to run against the dataset

FLAGS
  --anonymous            Send the query without any authorization token
  --api-version=<value>  [env: SANITY_CLI_QUERY_API_VERSION] API version to use (defaults to 2025-08-15)
  --pretty               Colorize JSON output

OVERRIDE FLAGS
  -d, --dataset=<name>   Dataset to query (overrides CLI configuration)
  -p, --project-id=<id>  Project ID to query (overrides CLI configuration)

DESCRIPTION
  Query for documents

EXAMPLES
  Fetch 5 documents of type "movie"

    $ sanity documents query '*[_type == "movie"][0..4]'

  Fetch title of the oldest movie in the dataset named "staging"

    $ sanity documents query '*[_type == "movie"]|order(releaseDate asc)[0]{title}' --dataset staging

  Use API version v2021-06-07 and do a query

    $ sanity documents query '*[_id == "header"] { "headerText": pt::text(body) }' --api-version v2021-06-07

  Query documents in a specific project and dataset

    $ sanity documents query '*[_type == "post"]' --project-id abc123 --dataset production
```

## `sanity documents validate`

Validate documents in a dataset against the studio schema

```
USAGE
  $ sanity documents validate [-p <id>] [-d <name>] [--file <value>] [--format <value>] [--level error|warning|info]
    [--max-custom-validation-concurrency <value>] [--max-fetch-concurrency <value>] [--workspace <value>] [-y]

FLAGS
  -d, --dataset=<name>                             Override the dataset used. By default, this is derived from the given
                                                   workspace
  -p, --project-id=<id>                            Override the project ID used. By default, this is derived from the
                                                   given workspace
  -y, --yes                                        Skips the first confirmation prompt
      --file=<value>                               Provide a path to either an .ndjson file or a tarball containing an
                                                   .ndjson file
      --format=<value>                             The output format used to print the found validation markers and
                                                   report progress
      --level=<option>                             [default: warning] The minimum level reported. Defaults to warning
                                                   <options: error|warning|info>
      --max-custom-validation-concurrency=<value>  [default: 5] Specify how many custom validators can run concurrently
      --max-fetch-concurrency=<value>              [default: 25] Specify how many `client.fetch` requests are allowed to
                                                   run concurrently
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

  Validate documents in a specific project and dataset

    $ sanity documents validate --project-id abc123 --dataset production
```

## `sanity exec SCRIPT`

Executes a script within the Sanity Studio context

```
USAGE
  $ sanity exec SCRIPT... [--mock-browser-env] [--with-user-token]

ARGUMENTS
  SCRIPT...  Path to the script to execute

FLAGS
  --mock-browser-env  Mock a browser environment with jsdom
  --with-user-token   Include your auth token in getCliClient()

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

## `sanity functions add`

Add a Function to your Blueprint

```
USAGE
  $ sanity functions add [--example <value> | -n <value> |  | --language ts|js | --javascript |  | ] [--type
    document-publish|document-create|document-update|document-delete|media-library-asset-create|media-library-asset-upda
    te|media-library-asset-delete|scheduled-function... ] [--helpers] [--installer skip|npm|pnpm|yarn] [-i | ]

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
                            <options: document-publish|document-create|document-update|document-delete|media-library-ass
                            et-create|media-library-asset-update|media-library-asset-delete|scheduled-function>

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

## `sanity functions logs [NAME]`

Retrieve or delete logs for a Sanity Function

```
USAGE
  $ sanity functions logs [NAME] [--stack <value>] [-u] [-f [-d | -l <value> | -j]] [-w]

ARGUMENTS
  [NAME]  The name of the Sanity Function

FLAGS
  -d, --delete         Delete all logs for the function
  -f, --force          Skip confirmation for deleting logs
  -j, --json           Return logs in JSON format
  -l, --limit=<value>  [default: 50] Total number of log entries to retrieve
  -u, --utc            Show dates in UTC time zone
  -w, --watch          Watch for new logs (streaming mode)
      --stack=<value>  Stack name or ID to use instead of the locally configured Stack

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

## `sanity graphql deploy`

Deploy a GraphQL API from the current Sanity schema

```
USAGE
  $ sanity graphql deploy [--api <value>...] [-d <name>] [--dry-run] [--force] [--generation gen1|gen2|gen3]
    [--non-null-document-fields] [--playground] [--tag <value>] [--with-union-cache]

FLAGS
  -d, --dataset=<name>            Deploy API for the given dataset
      --api=<value>...            Only deploy API with this ID (can be specified multiple times)
      --dry-run                   Validate defined GraphQL APIs, check for breaking changes, skip deploy
      --force                     Deploy API without confirming breaking changes
      --generation=<option>       API generation to deploy (defaults to "gen3")
                                  <options: gen1|gen2|gen3>
      --non-null-document-fields  Use non-null document fields (_id, _type etc)
      --[no-]playground           Enable GraphQL playground for easier debugging
      --tag=<value>               Deploy API(s) to given tag (defaults to "default")
      --with-union-cache          Cache union types (faster for schemas with many self-references)

DESCRIPTION
  Deploy a GraphQL API from the current Sanity schema

EXAMPLES
  Deploy all defined GraphQL APIs

    $ sanity graphql deploy

  Validate defined GraphQL APIs, check for breaking changes, skip deploy

    $ sanity graphql deploy --dry-run

  Deploy only the GraphQL APIs with the IDs "staging" and "ios"

    $ sanity graphql deploy --api staging --api ios

  Deploy all defined GraphQL APIs, overriding any playground setting

    $ sanity graphql deploy --playground
```

## `sanity graphql list`

List deployed GraphQL endpoints for the project

```
USAGE
  $ sanity graphql list [-p <id>]

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list GraphQL endpoints for (overrides CLI configuration)

DESCRIPTION
  List deployed GraphQL endpoints for the project

EXAMPLES
  List GraphQL endpoints for the project

    $ sanity graphql list

  List GraphQL endpoints for a specific project

    $ sanity graphql list --project-id abc123
```

## `sanity graphql undeploy`

Remove a deployed GraphQL API

```
USAGE
  $ sanity graphql undeploy [--api <value> | -p <id> | ] [-d <name>] [--force] [--tag <value>]

FLAGS
  --api=<value>  Undeploy API with this ID
  --force        Skip confirmation prompt
  --tag=<value>  [default: default] Tag to undeploy GraphQL API from

OVERRIDE FLAGS
  -d, --dataset=<name>   Dataset to undeploy GraphQL API from (overrides CLI configuration)
  -p, --project-id=<id>  Project ID to undeploy GraphQL API from (overrides CLI configuration)

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

  Undeploy GraphQL API for a specific project and dataset

    $ sanity graphql undeploy --project-id abc123 --dataset production
```

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

## `sanity hooks attempt ATTEMPTID`

Print details of a given webhook delivery attempt

```
USAGE
  $ sanity hooks attempt ATTEMPTID [-p <id>]

ARGUMENTS
  ATTEMPTID  The delivery attempt ID to get details for

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to view webhook attempt for (overrides CLI configuration)

DESCRIPTION
  Print details of a given webhook delivery attempt

EXAMPLES
  Print details of webhook delivery attempt with ID abc123

    $ sanity hooks attempt abc123

  Get attempt details for a specific project

    $ sanity hooks attempt abc123 --project-id projectId
```

## `sanity hooks create`

Create a new webhook for the project

```
USAGE
  $ sanity hooks create [-p <id>]

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to create webhook for (overrides CLI configuration)

DESCRIPTION
  Create a new webhook for the project

EXAMPLES
  Create a new webhook for the project

    $ sanity hooks create

  Create a webhook for a specific project

    $ sanity hooks create --project-id abc123
```

## `sanity hooks delete [NAME]`

Delete a webhook from the project

```
USAGE
  $ sanity hooks delete [NAME] [-p <id>]

ARGUMENTS
  [NAME]  Name of webhook to delete (will prompt if not provided)

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete webhook from (overrides CLI configuration)

DESCRIPTION
  Delete a webhook from the project

EXAMPLES
  Interactively select and delete a webhook

    $ sanity hooks delete

  Delete a specific webhook by name

    $ sanity hooks delete my-hook

  Delete a webhook from a specific project

    $ sanity hooks delete --project-id abc123
```

## `sanity hooks list`

List webhooks for the project

```
USAGE
  $ sanity hooks list [-p <id>]

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list webhooks for (overrides CLI configuration)

DESCRIPTION
  List webhooks for the project

EXAMPLES
  List webhooks for the project

    $ sanity hooks list

  List webhooks for a specific project

    $ sanity hooks list --project-id abc123
```

## `sanity hooks logs [NAME]`

Show log entries for project webhooks

```
USAGE
  $ sanity hooks logs [NAME] [-p <id>] [--detailed]

ARGUMENTS
  [NAME]  Name of the webhook to show logs for

FLAGS
  --detailed  Include detailed payload and attempts

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to view webhook logs for (overrides CLI configuration)

DESCRIPTION
  Show log entries for project webhooks

EXAMPLES
  Show log entries for project webhooks

    $ sanity hooks logs

  Show log entries for a specific webhook by name

    $ sanity hooks logs [NAME]

  Show log entries for a specific project

    $ sanity hooks logs --project-id abc123
```

## `sanity init`

Initialize a new Sanity Studio, project and/or app

```
USAGE
  $ sanity init [--json] [--auto-updates | --bare] [--coupon <code> | --project-plan <name>] [--dataset
    <name> | --dataset-default] [--env <filename> | ] [--git <message> | ] [--import-dataset] [--mcp]
    [--nextjs-add-config-files] [--nextjs-append-env] [--nextjs-embed-studio] [--organization <id>] [--output-path
    <path> | ] [--overwrite-files] [--package-manager <manager> | ] [--project <id> |  | --project-name <name>]
    [--provider <provider>] [--template <template> | ] [--typescript | ] [--visibility <mode>] [-y]

FLAGS
  -y, --yes                        Unattended mode, answers "yes" to any "yes/no" prompt and otherwise uses defaults
      --[no-]auto-updates          Enable auto updates of studio versions
      --bare                       Skip the Studio initialization and only print the selected project ID and dataset
                                   name to stdout
      --coupon=<code>              Optionally select a coupon for a new project (cannot be used with --project-plan)
      --dataset=<name>             Dataset name for the studio
      --dataset-default            Set up a project with a public dataset named "production"
      --env=<filename>             Write environment variables to file
      --[no-]git=<message>         Specify a commit message for initial commit, or disable git init
      --[no-]import-dataset        Import template sample dataset
      --[no-]mcp                   Enable AI editor integration (MCP) setup
      --organization=<id>          Organization ID to use for the project
      --output-path=<path>         Path to write studio project to
      --[no-]overwrite-files       Overwrite existing files
      --package-manager=<manager>  Specify which package manager to use [allowed: npm, yarn, pnpm]
      --project=<id>               Project ID to use for the studio
      --project-name=<name>        Create a new project with the given name
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

    $ sanity init -y --project-name "Movies Unlimited" --dataset moviedb --visibility private --template moviedb \
      --output-path /Users/espenh/movies-unlimited
```

## `sanity install [PACKAGES]`

Install dependencies for the Sanity Studio project

```
USAGE
  $ sanity install [PACKAGES...]

ARGUMENTS
  [PACKAGES...]  Packages to install

DESCRIPTION
  Install dependencies for the Sanity Studio project

EXAMPLES
  $ sanity install

  $ sanity install @sanity/vision

  $ sanity install some-package another-package
```

## `sanity learn`

Open Sanity Learn in your browser

```
USAGE
  $ sanity learn

DESCRIPTION
  Open Sanity Learn in your browser
```

## `sanity login`

Log in to your Sanity account

```
USAGE
  $ sanity login [--open] [--provider <providerId> | --sso <slug>] [--sso-provider <name> ]

FLAGS
  --[no-]open              Open a browser window to log in (`--no-open` only prints URL)
  --provider=<providerId>  Log in using the given provider
  --sso=<slug>             Log in using Single Sign-On, using the given organization slug
  --sso-provider=<name>    Select a specific SSO provider by name (use with --sso)

DESCRIPTION
  Log in to your Sanity account

EXAMPLES
  Log in using default settings

    $ sanity login

  Login with GitHub provider, but do not open a browser window automatically

    $ sanity login --provider github --no-open

  Log in using Single Sign-On with the "my-organization" slug

    $ sanity login --sso my-organization

  Log in using a specific SSO provider within an organization

    $ sanity login --sso my-organization --sso-provider "Okta SSO"
```

## `sanity logout`

Log out of the current session

```
USAGE
  $ sanity logout

DESCRIPTION
  Log out of the current session
```

## `sanity manage`

Open project settings in your browser

```
USAGE
  $ sanity manage

DESCRIPTION
  Open project settings in your browser
```

## `sanity manifest extract`

Extract studio configuration as JSON manifest files.

```
USAGE
  $ sanity manifest extract [--path <value>]

FLAGS
  --path=<value>  [default: dist/static] Optional path to specify destination directory of the manifest files

DESCRIPTION
  Extract studio configuration as JSON manifest files.

  Note: This command is experimental and subject to change. It is currently intended for use with Create only.

EXAMPLES
  Extracts manifests

    $ sanity manifest extract

  Extracts manifests into /public/static

    $ sanity manifest extract --path /public/static
```

## `sanity mcp configure`

Configure Sanity MCP server for AI editors (Claude Code, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code)

```
USAGE
  $ sanity mcp configure

DESCRIPTION
  Configure Sanity MCP server for AI editors (Claude Code, Codex CLI, Cursor, Gemini CLI, GitHub Copilot CLI, VS Code)

EXAMPLES
  Configure Sanity MCP server for detected AI editors

    $ sanity mcp configure
```

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

## `sanity media delete-aspect ASPECTNAME`

Delete an aspect definition

```
USAGE
  $ sanity media delete-aspect ASPECTNAME [-p <id>] [--media-library-id <value>] [--yes]

ARGUMENTS
  ASPECTNAME  Name of the aspect to delete

FLAGS
  --media-library-id=<value>  The id of the target media library
  --yes                       Skip confirmation prompt

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete media aspect from (overrides CLI configuration)

DESCRIPTION
  Delete an aspect definition

EXAMPLES
  Delete the aspect named "someAspect"

    $ sanity media delete-aspect someAspect
```

## `sanity media deploy-aspect [ASPECTNAME]`

Deploy an aspect

```
USAGE
  $ sanity media deploy-aspect [ASPECTNAME] [-p <id>] [--all] [--media-library-id <value>]

ARGUMENTS
  [ASPECTNAME]  Name of the aspect to deploy

FLAGS
  --all                       Deploy all aspects
  --media-library-id=<value>  The id of the target media library

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to deploy media aspect to (overrides CLI configuration)

DESCRIPTION
  Deploy an aspect

EXAMPLES
  Deploy the aspect named "someAspect"

    $ sanity media deploy-aspect someAspect

  Deploy all aspects

    $ sanity media deploy-aspect --all
```

## `sanity media export [DESTINATION]`

Export file and image assets from a media library (excludes video)

```
USAGE
  $ sanity media export [DESTINATION] [-p <id>] [--asset-concurrency <value>] [--media-library-id <value>]
    [--no-compress] [--overwrite]

ARGUMENTS
  [DESTINATION]  Output destination file path

FLAGS
  --asset-concurrency=<value>  [default: 8] Concurrent number of asset downloads
  --media-library-id=<value>   The id of the target media library
  --no-compress                Skips compressing tarball entries (still generates a gzip file)
  --overwrite                  Overwrite any file with the same name

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to export media from (overrides CLI configuration)

DESCRIPTION
  Export file and image assets from a media library (excludes video)

EXAMPLES
  Export media library interactively

    $ sanity media export

  Export media library to output.tar.gz

    $ sanity media export output.tar.gz

  Export specific media library

    $ sanity media export --media-library-id my-library-id
```

## `sanity media import SOURCE`

Import a set of assets to the target media library.

```
USAGE
  $ sanity media import SOURCE [-p <id>] [--media-library-id <value>] [--replace-aspects]

ARGUMENTS
  SOURCE  Image file or folder to import from

FLAGS
  --media-library-id=<value>  The id of the target media library
  --replace-aspects           Replace existing aspect data. All versions will be replaced (e.g. published and draft
                              aspect data)

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to import media to (overrides CLI configuration)

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

## `sanity migrations create [TITLE]`

Create a new migration within your project

```
USAGE
  $ sanity migrations create [TITLE]

ARGUMENTS
  [TITLE]  Title of migration

DESCRIPTION
  Create a new migration within your project

EXAMPLES
  Create a new migration, prompting for title and options

    $ sanity migrations create

  Create a new migration with the provided title, prompting for options

    $ sanity migrations create "Rename field from location to address"
```

## `sanity migrations list`

List available migrations

```
USAGE
  $ sanity migrations list

DESCRIPTION
  List available migrations

EXAMPLES
  List all available migrations in the project

    $ sanity migrations list
```

## `sanity migrations run [ID]`

Run a migration against a dataset

```
USAGE
  $ sanity migrations run [ID] [--api-version <value>] [--concurrency <value>] [--confirm] [--dataset <value>]
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

    $ sanity migrations run <id>

  execute the migration against a dataset

    $ sanity migrations run <id> --no-dry-run --project xyz --dataset staging

  execute the migration using a dataset export as the source

    $ sanity migrations run <id> --from-export=production.tar.gz --no-dry-run --project xyz --dataset staging
```

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

## `sanity preview [OUTPUTDIR]`

Start a local server to preview a production build

```
USAGE
  $ sanity preview [OUTPUTDIR] [--host <value>] [--port <value>]

ARGUMENTS
  [OUTPUTDIR]  Output directory

FLAGS
  --host=<value>  Local network interface to listen on (default: localhost)
  --port=<value>  TCP port to start server on (default: 3333)

DESCRIPTION
  Start a local server to preview a production build

EXAMPLES
  $ sanity preview --host=0.0.0.0

  $ sanity preview --port=1942

  $ sanity preview some/build-output-dir
```

## `sanity projects create [PROJECTNAME]`

Create a new Sanity project

```
USAGE
  $ sanity projects create [PROJECTNAME] [--dataset <value>] [--dataset-visibility private|public] [--json]
    [--organization <slug|id>] [-y]

ARGUMENTS
  [PROJECTNAME]  Name of the project to create

FLAGS
  -y, --yes                          Skip prompts and use defaults (project: "My Sanity Project", dataset: production,
                                     visibility: public)
      --dataset=<value>              Create a dataset. Prompts for visibility unless specified or --yes used
      --dataset-visibility=<option>  Dataset visibility: public or private
                                     <options: private|public>
      --json                         Output in JSON format
      --organization=<slug|id>       Organization to create the project in

DESCRIPTION
  Create a new Sanity project

EXAMPLES
  Interactively create a project

    $ sanity projects create

  Create a project named "My New Project"

    $ sanity projects create "My New Project"

  Create a project in a specific organization

    $ sanity projects create "My Project" --organization=my-org

  Create a project with a private dataset named "staging"

    $ sanity projects create "My Project" --dataset=staging --dataset-visibility=private

  Create a project non-interactively with JSON output

    $ sanity projects create "CI Project" --yes --json
```

## `sanity projects list`

List your projects

```
USAGE
  $ sanity projects list [--order asc|desc] [--sort id|members|name|url|created]

FLAGS
  --order=<option>  [default: desc] Sort direction
                    <options: asc|desc>
  --sort=<option>   [default: created] Sort field
                    <options: id|members|name|url|created>

DESCRIPTION
  List your projects

EXAMPLES
  List projects

    $ sanity projects list

  List projects sorted by member count, ascending

    $ sanity projects list --sort=members --order=asc
```

## `sanity schemas delete`

Delete schema documents by id

```
USAGE
  $ sanity schemas delete --ids <value> [-p <id>] [-d <name>] [--verbose]

FLAGS
  -d, --dataset=<name>  Delete schemas from a specific dataset
      --ids=<value>     (required) Comma-separated list of schema ids to delete
      --verbose         Enable verbose logging

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete schema from (overrides CLI configuration)

DESCRIPTION
  Delete schema documents by id

EXAMPLES
  Delete a single schema

    $ sanity schemas delete --ids sanity.workspace.schema.workspaceName

  Delete multiple schemas

    $ sanity schemas delete --ids \
      sanity.workspace.schema.workspaceName,prefix.sanity.workspace.schema.otherWorkspace
```

## `sanity schemas deploy`

Deploy schema documents into workspace datasets.

```
USAGE
  $ sanity schemas deploy [--extract-manifest] [--manifest-dir <directory>] [--tag <tag>] [--verbose] [--workspace
    <name>]

FLAGS
  --[no-]extract-manifest     Regenerate manifest before deploying (use --no-extract-manifest to skip)
  --manifest-dir=<directory>  [default: ./dist/static] Directory containing manifest file
  --tag=<tag>                 Add a tag suffix to the schema id
  --verbose                   Print detailed information during deployment
  --workspace=<name>          The name of the workspace to deploy a schema for

DESCRIPTION
  Deploy schema documents into workspace datasets.

  Note: This command is experimental and subject to change.

  Regenerates a manifest file by default. To re-use an existing manifest, use --no-extract-manifest.

EXAMPLES
  Deploy all workspace schemas

    $ sanity schemas deploy

  Deploy the schema for only the workspace "default"

    $ sanity schemas deploy --workspace default
```

## `sanity schemas extract`

Extract a JSON representation of a Sanity schema within a Studio context.

```
USAGE
  $ sanity schemas extract [--enforce-required-fields] [--format <format>] [--path <value>] [--watch]
    [--watch-patterns <glob>...] [--workspace <name>]

FLAGS
  --enforce-required-fields   Makes the schema generated treat fields marked as required as non-optional
  --format=<format>           [default: groq-type-nodes] Output format (currently only groq-type-nodes)
  --path=<value>              Optional path to specify destination of the schema file
  --watch                     Enable watch mode to re-extract schema on file changes
  --watch-patterns=<glob>...  Additional glob pattern(s) to watch (can be specified multiple times)
  --workspace=<name>          The name of the workspace to generate a schema for

DESCRIPTION
  Extract a JSON representation of a Sanity schema within a Studio context.

  Note: This command is experimental and subject to change.

EXAMPLES
  Extracts schema types in a Sanity project with more than one workspace

    $ sanity schemas extract --workspace default

  Watch mode - re-extract on changes

    $ sanity schemas extract --watch

  Watch with custom glob patterns

    $ sanity schemas extract --watch --watch-patterns "lib/**/*.ts"
```

## `sanity schemas list`

List all schemas in the current dataset.

```
USAGE
  $ sanity schemas list [--id <schema_id>] [--json]

FLAGS
  --id=<schema_id>  Fetch a single schema by id
  --json            Get schema as json

DESCRIPTION
  List all schemas in the current dataset.

  Note: This command is experimental and subject to change.

  Regenerates a manifest file by default. To reuse an existing manifest, use --no-extract-manifest.

EXAMPLES
  List all schemas found in any workspace dataset in a table

    $ sanity schemas list

  Get a schema for a given id

    $ sanity schemas list --id _.schemas.workspaceName

  Get stored schemas as pretty-printed json-array

    $ sanity schemas list --json

  Get singular stored schema as pretty-printed json-object

    $ sanity schemas list --json --id _.schemas.workspaceName
```

## `sanity schemas validate`

Validates all schema types specified in a workspace

```
USAGE
  $ sanity schemas validate [--debug-metafile-path <value>] [--format pretty|ndjson|json] [--level error|warning]
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

    $ sanity schemas validate --workspace default

  Save the results of the report into a file

    $ sanity schemas validate > report.txt

  Report out only errors

    $ sanity schemas validate --level error

  Generate a report which can be analyzed with https://esbuild.github.io/analyze/

    $ sanity schemas validate --debug-metafile-path metafile.json
```

## `sanity telemetry disable`

Disable telemetry for your account

```
USAGE
  $ sanity telemetry disable

DESCRIPTION
  Disable telemetry for your account

EXAMPLES
  Disable telemetry for your account

    $ sanity telemetry telemetry disable
```

## `sanity telemetry enable`

Enable telemetry for your account

```
USAGE
  $ sanity telemetry enable

DESCRIPTION
  Enable telemetry for your account

EXAMPLES
  Enable telemetry for your account

    $ sanity telemetry telemetry enable
```

## `sanity telemetry status`

Check telemetry status for your account

```
USAGE
  $ sanity telemetry status

DESCRIPTION
  Check telemetry status for your account

EXAMPLES
  Check telemetry status for your account

    $ sanity telemetry telemetry status
```

## `sanity tokens add [LABEL]`

Create a new API token for the project

```
USAGE
  $ sanity tokens add [LABEL] [-p <id>] [--json] [--role viewer] [-y]

ARGUMENTS
  [LABEL]  Label for the new token

FLAGS
  -y, --yes          Skip prompts and use defaults (unattended mode)
      --json         Output as JSON
      --role=viewer  Role to assign to the token

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to add token to (overrides CLI configuration)

DESCRIPTION
  Create a new API token for the project

EXAMPLES
  Create a token with a label

    $ sanity tokens add "My API Token"

  Create a token with editor role

    $ sanity tokens add "My API Token" --role=editor

  Create a token in unattended mode

    $ sanity tokens add "CI Token" --role=editor --yes

  Output token information as JSON

    $ sanity tokens add "API Token" --json

  Create a token for a specific project

    $ sanity tokens add "My Token" --project-id abc123 --role=editor
```

## `sanity tokens delete [TOKENID]`

Delete an API token from the project

```
USAGE
  $ sanity tokens delete [TOKENID] [-p <id>] [--yes]

ARGUMENTS
  [TOKENID]  Token ID to delete (will prompt if not provided)

FLAGS
  --yes  Skip confirmation prompt (unattended mode)

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to delete token from (overrides CLI configuration)

DESCRIPTION
  Delete an API token from the project

EXAMPLES
  Interactively select and delete a token

    $ sanity tokens delete

  Delete a specific token by ID

    $ sanity tokens delete silJ2lFmK6dONB

  Delete a specific token without confirmation prompt

    $ sanity tokens delete silJ2lFmK6dONB --yes

  Delete a token from a specific project

    $ sanity tokens delete --project-id abc123
```

## `sanity tokens list`

List API tokens for the project

```
USAGE
  $ sanity tokens list [-p <id>] [--json]

FLAGS
  --json  Output tokens in JSON format

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list tokens for (overrides CLI configuration)

DESCRIPTION
  List API tokens for the project

EXAMPLES
  List tokens for the project

    $ sanity tokens list

  List tokens in JSON format

    $ sanity tokens list --json

  List tokens for a specific project

    $ sanity tokens list --project-id abc123
```

## `sanity typegen generate`

Sanity TypeGen

```
USAGE
  $ sanity typegen generate [--config-path <value>] [--watch]

FLAGS
  --config-path=<value>  [Default: sanity-typegen.json] Specifies the path to the typegen configuration file. This file
                         should be a JSON file that contains settings for the type generation process.
  --watch                [Default: false] Run the typegen in watch mode

DESCRIPTION
  Sanity TypeGen

  Configuration:
  This command can utilize configuration settings defined in a `sanity-typegen.json` file. These settings include:

  - "path": Specifies a glob pattern to locate your TypeScript or JavaScript files.
  Default: "./src/**/*.{ts,tsx,js,jsx}"

  - "schema": Defines the path to your Sanity schema file. This file should be generated using the `sanity schema
  extract` command.
  Default: "schema.json"

  - "generates": Indicates the path where the generated TypeScript type definitions will be saved.
  Default: "./sanity.types.ts"

  The default configuration values listed above are used if not overridden in your `sanity-typegen.json` configuration
  file. To customize the behavior of the type generation, adjust these properties in the configuration file according to
  your project's needs.

  Note:
  - The `sanity schema extract` command is a prerequisite for extracting your Sanity Studio schema into a `schema.json`
  file, which is then used by the `sanity typegen generate` command to generate type definitions.

EXAMPLES
  Generate TypeScript type definitions from a Sanity Studio schema extracted using the `sanity schema extract`
  command.

    $ sanity typegen generate
```

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

## `sanity users invite [EMAIL]`

Invite a new user to the project

```
USAGE
  $ sanity users invite [EMAIL] [-p <id>] [--role <value>]

ARGUMENTS
  [EMAIL]  Email address to invite

FLAGS
  --role=<value>  Role to invite the user as

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to invite user to (overrides CLI configuration)

DESCRIPTION
  Invite a new user to the project

EXAMPLES
  Invite a new user to the project (prompt for details)

    $ sanity users invite

  Send a new user invite to the email "pippi@sanity.io", prompt for role

    $ sanity users invite pippi@sanity.io

  Send a new user invite to the email "pippi@sanity.io", as administrator

    $ sanity users invite pippi@sanity.io --role administrator

  Invite a user to a specific project

    $ sanity users invite pippi@sanity.io --project-id abc123
```

## `sanity users list`

List project members

```
USAGE
  $ sanity users list [-p <id>] [--invitations] [--order asc|desc] [--robots] [--sort id|name|role|date]

FLAGS
  --[no-]invitations  Includes or excludes pending invitations
  --order=<option>    [default: asc] Sort output ascending/descending
                      <options: asc|desc>
  --[no-]robots       Includes or excludes robots (token users)
  --sort=<option>     [default: date] Sort users by specified column
                      <options: id|name|role|date>

OVERRIDE FLAGS
  -p, --project-id=<id>  Project ID to list users for (overrides CLI configuration)

DESCRIPTION
  List project members

EXAMPLES
  List all users of the project

    $ sanity users list

  List all users of the project, but exclude pending invitations and robots

    $ sanity users list --no-invitations --no-robots

  List all users, sorted by role

    $ sanity users list --sort role

  List users for a specific project

    $ sanity users list --project-id abc123
```

## `sanity versions`

Show installed package versions

```
USAGE
  $ sanity versions

DESCRIPTION
  Show installed package versions

EXAMPLES
  $ sanity versions
```

<!-- commandsstop -->
