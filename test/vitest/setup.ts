// If these env vars exist in the environment, they can cause tests to behave unpredictably
delete process.env.SANITY_ACTIVE_ENV
delete process.env.SANITY_API_HOST
delete process.env.SANITY_APP_BASEPATH
delete process.env.SANITY_AUTH_TOKEN
delete process.env.SANITY_BASE_PATH
delete process.env.SANITY_CLI_CALLBACK_PORT
delete process.env.SANITY_CLI_CONFIG_PATH
delete process.env.SANITY_CLI_QUERY_API_VERSION
delete process.env.SANITY_INTERNAL_IS_WORKBENCH_REMOTE
delete process.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL
delete process.env.SANITY_MODULES_HOST
delete process.env.SANITY_STUDIO_BASEPATH
delete process.env.SANITY_STUDIO_REACT_STRICT_MODE
delete process.env.SANITY_TELEMETRY_PROJECT_ID

process.env.SANITY_INTERNAL_ENV = 'production'
