import {type CliCommandDefinition, type CliCommandGroupDefinition} from '../types.js'
import backupGroup from './backup/backupGroup.js'
import disableBackupCommand from './backup/disableBackupCommand.js'
import downloadBackupCommand from './backup/downloadBackupCommand.js'
import enableBackupCommand from './backup/enableBackupCommand.js'
import listBackupCommand from './backup/listBackupCommand.js'
import buildCommand from './build/buildCommand.js'
import codemodCommand from './codemod/codemodCommand.js'
import addCorsOriginCommand from './cors/addCorsOriginCommand.js'
import corsGroup from './cors/corsGroup.js'
import deleteCorsOriginCommand from './cors/deleteCorsOriginCommand.js'
import listCorsOriginsCommand from './cors/listCorsOriginsCommand.js'
import aliasDatasetCommand from './dataset/alias/aliasCommands.js'
import copyDatasetCommand from './dataset/copyDatasetCommand.js'
import createDatasetCommand from './dataset/createDatasetCommand.js'
import datasetGroup from './dataset/datasetGroup.js'
import datasetVisibilityCommand from './dataset/datasetVisibilityCommand.js'
import deleteDatasetCommand from './dataset/deleteDatasetCommand.js'
import exportDatasetCommand from './dataset/exportDatasetCommand.js'
import importDatasetCommand from './dataset/importDatasetCommand.js'
import listDatasetsCommand from './dataset/listDatasetsCommand.js'
import debugCommand from './debug/debugCommand.js'
import deployCommand from './deploy/deployCommand.js'
import undeployCommand from './deploy/undeployCommand.js'
import devCommand from './dev/devCommand.js'
import docsCommand from './docs/docsCommand.js'
import createDocumentsCommand from './documents/createDocumentsCommand.js'
import deleteDocumentsCommand from './documents/deleteDocumentsCommand.js'
import documentsGroup from './documents/documentsGroup.js'
import getDocumentsCommand from './documents/getDocumentsCommand.js'
import queryDocumentsCommand from './documents/queryDocumentsCommand.js'
import validateDocumentsCommand from './documents/validateDocumentsCommand.js'
import execCommand from './exec/execCommand.js'
import deleteGraphQLAPICommand from './graphql/deleteGraphQLAPICommand.js'
import deployGraphQLAPICommand from './graphql/deployGraphQLAPICommand.js'
import graphqlGroup from './graphql/graphqlGroup.js'
import listGraphQLAPIsCommand from './graphql/listGraphQLAPIsCommand.js'
import helpCommand from './help/helpCommand.js'
import createHookCommand from './hook/createHookCommand.js'
import deleteHookCommand from './hook/deleteHookCommand.js'
import hookGroup from './hook/hookGroup.js'
import listHookLogsCommand from './hook/listHookLogsCommand.js'
import listHooksCommand from './hook/listHooksCommand.js'
import printHookAttemptCommand from './hook/printHookAttemptCommand.js'
import initCommand from './init/initCommand.js'
import installCommand from './install/installCommand.js'
import learnCommand from './learn/learnCommand.js'
import loginCommand from './login/loginCommand.js'
import logoutCommand from './logout/logoutCommand.js'
import manageCommand from './manage/manageCommand.js'
import extractManifestCommand from './manifest/extractManifestCommand.js'
import manifestGroup from './manifest/manifestGroup.js'
import createMigrationCommand from './migration/createMigrationCommand.js'
import listMigrationsCommand from './migration/listMigrationsCommand.js'
import migrationGroup from './migration/migrationGroup.js'
import runMigrationCommand from './migration/runMigrationCommand.js'
import previewCommand from './preview/previewCommand.js'
import listProjectsCommand from './projects/listProjectsCommand.js'
import projectsGroup from './projects/projectsGroup.js'
import extractSchemaCommand from './schema/extractSchemaCommand.js'
import schemaGroup from './schema/schemaGroup.js'
import validateSchemaCommand from './schema/validateSchemaCommand.js'
import startCommand from './start/startCommand.js'
import disableTelemetryCommand from './telemetry/disableTelemetryCommand.js'
import enableTelemetryCommand from './telemetry/enableTelemetryCommand.js'
import telemetryGroup from './telemetry/telemetryGroup.js'
import telemetryStatusCommand from './telemetry/telemetryStatusCommand.js'
import generateTypegenCommand from './typegen/generateTypesCommand.js'
import typegenGroup from './typegen/typegenGroup.js'
import inviteUserCommand from './users/inviteUserCommand.js'
import listUsersCommand from './users/listUsersCommand.js'
import usersGroup from './users/usersGroup.js'
import versionsCommand from './versions/versionsCommand.js'

export const baseCommands: (CliCommandDefinition | CliCommandGroupDefinition)[] = [
  addCorsOriginCommand,
  aliasDatasetCommand,
  backupGroup,
  buildCommand,
  codemodCommand,
  copyDatasetCommand,
  corsGroup,
  createDatasetCommand,
  createDocumentsCommand,
  createHookCommand,
  createMigrationCommand,
  datasetGroup,
  datasetVisibilityCommand,
  debugCommand,
  deleteCorsOriginCommand,
  deleteDatasetCommand,
  deleteDocumentsCommand,
  deleteGraphQLAPICommand,
  deleteHookCommand,
  deployCommand,
  deployGraphQLAPICommand,
  devCommand,
  disableBackupCommand,
  disableTelemetryCommand,
  docsCommand,
  documentsGroup,
  downloadBackupCommand,
  enableBackupCommand,
  enableTelemetryCommand,
  execCommand,
  exportDatasetCommand,
  extractManifestCommand,
  extractSchemaCommand,
  generateTypegenCommand,
  getDocumentsCommand,
  graphqlGroup,
  helpCommand,
  hookGroup,
  importDatasetCommand,
  initCommand,
  installCommand,
  inviteUserCommand,
  learnCommand,
  listBackupCommand,
  listCorsOriginsCommand,
  listDatasetsCommand,
  listGraphQLAPIsCommand,
  listHookLogsCommand,
  listHooksCommand,
  listMigrationsCommand,
  listProjectsCommand,
  listUsersCommand,
  loginCommand,
  logoutCommand,
  manageCommand,
  manifestGroup,
  migrationGroup,
  previewCommand,
  printHookAttemptCommand,
  projectsGroup,
  queryDocumentsCommand,
  runMigrationCommand,
  schemaGroup,
  startCommand,
  telemetryGroup,
  telemetryStatusCommand,
  typegenGroup,
  undeployCommand,
  usersGroup,
  validateDocumentsCommand,
  validateSchemaCommand,
  versionsCommand,
]
