#!/usr/bin/env node
import { Command } from 'commander';
import {
  displayInfo,
  fastForward,
  generateMigration,
  getLatestIntrospection,
  introspectDatabase,
  migrate,
  rollback,
  saveIntrospection
} from './index.js';
import { loadConfig } from './lib/configuration.js';
import { getLogger } from './lib/logger.js';
import { connectToDatabase } from './lib/surrealdb.js';
import packageData from './package.json' with { type: 'json' };

const logger = getLogger('SurrealDB');

/**
 * Main command line interface
 */
const program = new Command();

program
  .name('surrealigrate')
  .description(
    'SurrealDB migration CLI tool for managing database schema changes'
  )
  .version(packageData.version)
  .option('-c, --config <path>', 'path to YAML configuration file')
  .option('-d, --dir <path>', 'directory containing migration files')
  .addHelpText(
    'after',
    `
Example calls:
  $ npm run migrate
  $ npm run migrate --to 5
  $ npm run rollback
  $ npm run rollback --to 3
  $ npm run info
  $ npm run extract
  $ npm run generate -- --name "migration-title"
  $ npm run generate -- -d ./migrations/pending -n "migration-title"

Configuration:
  This tool can be configured using a YAML file, environment variables, or a combination of both.
  Priority order: Environment Variables > YAML Config > Default Config

Environment Variables:
  SURREAL_URL                SurrealDB connection URL
  SURREAL_USER               Database user
  SURREAL_PASS               Database password
  SURREAL_NAMESPACE          Database namespace
  SURREAL_DATABASE           Database name
  SURREAL_MIGRATIONS_DIGITS  Number of digits to use for migration version
  SURREAL_MIGRATIONS_FOLDER  Folder to store migration files

For more information on each command, use: npm run help:[command]
`
  );
/**
 * Apply pending migrations to the database
 */
program
  .command('migrate')
  .description('Apply pending migrations to the database')
  .option('--to <version>', 'migrate to a specific version')
  .addHelpText(
    'after',
    `
Examples:
  $ npm run migrate
  $ npm run migrate --to 5
  $ npm run migrate -d ./custom-migrations

This command will apply all pending migrations or migrate to a specific version if --to is specified.
Migration files should be named in the format: <version>.<do|undo>.<title>.surql
  `
  )
  .action(async (options) => {
    if (program.opts().config) {
      await loadConfig(program.opts().config);
    }

    await migrate(program.opts().dir, options.to);
  });
/**
 * Fast forward to generated migrations
 */
program
  .command('fastforward')
  .description('Fast forward to generated migrations')
  .addHelpText(
    'after',
    `
Examples:
  $ npm run fastforward
  $ npm run fastforward -d ./custom-migrations

This command will fast forward the migration state to the last generated migration.
  `
  )
  .action(async () => {
    if (program.opts().config) {
      await loadConfig(program.opts().config);
    }

    await fastForward(program.opts().dir);
  });
/**
 * Rollback applied migrations
 */
program
  .command('rollback')
  .description('Rollback applied migrations')
  .option('--to <version>', 'rollback to a specific version')
  .addHelpText(
    'after',
    `
Examples:
  $ npm run rollback
  $ npm run rollback --to 3
  $ npm run rollback -d ./custom-migrations

This command will rollback the last applied migration or rollback to a specific version if --to is specified.
  `
  )
  .action(async (options) => {
    if (program.opts().config) {
      await loadConfig(program.opts().config);
    }

    await rollback(program.opts().dir, options.to);
  });
/**
 * Display information about the current migration status
 */
program
  .command('info')
  .description('Display information about the current migration status')
  .addHelpText(
    'after',
    `
Example:
  $ npm run info

This command will display:
  - Current version applied to the database
  - Latest available migration version
  - List of pending migrations (if any)
  `
  )
  .action(async () => {
    if (program.opts().config) {
      await loadConfig(program.opts().config);
    }

    await displayInfo(program.opts().dir);
  });
/**
 * Extract the current database structure and store schema introspection data
 */
program
  .command('extract')
  .description(
    'Inspect the current database structure and store schema introspection data'
  )
  .addHelpText(
    'after',
    `
Example:
  $ npm run extract

This command will:
  - Inspect the current database structure
  - Store schema introspection data in the database
  `
  )
  .action(async () => {
    if (program.opts().config) {
      await loadConfig(program.opts().config);
    }

    await connectToDatabase();
    const introspectionData = await introspectDatabase();
    await saveIntrospection(introspectionData.introspection);
  });
/**
 * Generate migration files
 * - Must be run after extract.
 */
program
  .command('generate')
  .description(
    'Analyze an updated database state, generate migration files, update migration status, and update stored introspection data. Must be run after extract.'
  )
  .option('-n, --name <title>', 'title of the migration')
  .addHelpText(
    'after',
    `
Example:
  $ npm run generate
  $ npm run generate -- --name "migration-title"
  $ npm run generate -- -d ./migrations/pending -n "migration-title"

This command will:
  - Analyze the updated database state
  - Generate migration files
  - Store introspection data in the database
  `
  )
  .action(async (options) => {
    if (program.opts().config) {
      await loadConfig(program.opts().config);
    }

    await connectToDatabase();
    const latestIntrospection = await getLatestIntrospection();
    if (!latestIntrospection?.data) {
      logger.warn(
        'The generate command does not make any database changes and therefore cannot initiate a stored intropection.'
      );
      logger.info(
        'Please run extract command first, this initializes the stored introspection data, and provides comparison data for the generate command.\n'
      );
      return;
    }
    const currentIntrospection = await introspectDatabase();

    await generateMigration(
      latestIntrospection.data,
      currentIntrospection,
      options.name
    );
    //await saveIntrospection(currentIntrospection);
  });

await program.parseAsync(process.argv);
process.exit(0);
