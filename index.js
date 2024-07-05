/**
 * Surrealigrate
 * @copyright Copyright (c) 2024 David Dyess II
 * @license MIT see LICENSE
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import config, { loadConfig } from './lib/configuration.js';
import { getLogger } from './lib/logger.js';
import { db, connectToDatabase } from './lib/surrealdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { log } from 'console';

// Setup logger
const logger = getLogger('SurrealDB');

async function getMigrationFiles(directory) {
  try {
    const files = await fs.readdir(directory);
    return files
      .filter((file) => file.includes('.do.') || file.includes('.undo.'))
      .reduce((acc, file) => {
        const [version, action, ...titleParts] = path
          .basename(file, '.surql')
          .split('.');
        const title = titleParts.join('.');
        if (!acc[version]) {
          acc[version] = { title };
        }
        acc[version][action] = file;
        return acc;
      }, {});
  } catch (error) {
    logger.error(`Failed to read migration files: ${error.message}\n`);
    process.exit(1);
  }
}

async function getCurrentVersion() {
  try {
    const result = await db.query(
      'SELECT * FROM migrations ORDER BY version DESC LIMIT 1'
    );

    return result[0]?.[0]?.version || 0;
  } catch (error) {
    logger.error(`Failed to get current version: ${error.message}\n`);
    return 0;
  }
}

async function setCurrentVersion(version, title = null) {
  try {
    if (title) {
      await db.query(
        'CREATE migrations SET version = $version, title = $title',
        {
          version,
          title
        }
      );
      logger.info(`Set current version to ${version} (${title})\n`);
    } else {
      await db.query('CREATE migrations SET version = $version', {
        version
      });
      logger.info(`Set current version to ${version}\n`);
    }
  } catch (error) {
    logger.error(`Failed to set current version: ${error.message}\n`);
    throw error;
  }
}

async function executeMigration(filePath, action) {
  const content = await fs.readFile(filePath, 'utf-8');
  await db.query('BEGIN TRANSACTION');
  try {
    await db.query(content);
    await db.query('COMMIT TRANSACTION');
    logger.info(
      `${action === 'do' ? 'Applied' : 'Reverted'} migration: ${path.basename(filePath)}`
    );
  } catch (error) {
    await db.query('CANCEL TRANSACTION');
    logger.error(
      `Failed to ${action === 'do' ? 'apply' : 'revert'} migration ${path.basename(filePath)}: ${error.message}\n`
    );
    throw error;
  }
}

async function migrate(directory, toVersion = null) {
  await connectToDatabase();
  const migrationFiles = await getMigrationFiles(directory);
  const currentVersion = await getCurrentVersion();
  const versions = Object.keys(migrationFiles).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  const targetVersion = toVersion
    ? parseInt(toVersion)
    : Math.max(...versions.map((v) => parseInt(v)));

  if (targetVersion < currentVersion) {
    logger.warn(
      `Current version (${currentVersion}) is higher than target version (${targetVersion}). Use rollback instead.\n`
    );
    return;
  }

  if (targetVersion === currentVersion) {
    logger.info('No pending migrations. Database is up to date.\n');
    return;
  }

  for (const version of versions) {
    if (
      parseInt(version) > currentVersion &&
      parseInt(version) <= targetVersion
    ) {
      const { do: doFile, title } = migrationFiles[version];
      logger.info(
        `Migrating to version ${version}${title ? ` (${title})` : ''}`
      );
      await executeMigration(path.join(directory, doFile), 'do');
      await setCurrentVersion(parseInt(version), title);
    }
  }
}

async function rollback(directory, toVersion = null) {
  await connectToDatabase();
  const migrationFiles = await getMigrationFiles(directory);
  const currentVersion = await getCurrentVersion();
  const versions = Object.keys(migrationFiles).sort(
    (a, b) => parseInt(b) - parseInt(a)
  );

  const targetVersion = toVersion ? parseInt(toVersion) : currentVersion - 1;

  if (targetVersion >= currentVersion) {
    logger.warn(
      `Target version (${targetVersion}) is not lower than current version (${currentVersion}). Use migrate instead.\n`
    );
    return;
  }

  for (const version of versions) {
    if (
      parseInt(version) <= currentVersion &&
      parseInt(version) > targetVersion
    ) {
      const { undo: undoFile, title } = migrationFiles[version];
      logger.info(
        `Rolling back version ${version}${title ? ` (${title})` : ''}`
      );
      await executeMigration(path.join(directory, undoFile), 'undo');
      const del = await db.query('DELETE migrations WHERE version = $version', {
        version: parseInt(version)
      });
    }
  }
}

async function getCurrentVersionInfo() {
  try {
    const result = await db.query(
      'SELECT * FROM migrations ORDER BY version DESC LIMIT 1'
    );

    return result[0]?.[0] || { version: 0, title: 'No migrations applied' };
  } catch (error) {
    logger.error(`Failed to get current version info: ${error.message}\n`);
    return { version: 0, title: 'Error retrieving version info' };
  }
}

async function getInfo(directory) {
  await connectToDatabase();
  const migrationFiles = await getMigrationFiles(directory);
  const currentVersionInfo = await getCurrentVersionInfo();

  const versions = Object.keys(migrationFiles).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  const latestVersion = Math.max(...versions.map((v) => parseInt(v)));

  const pendingMigrations = versions
    .filter((version) => parseInt(version) > currentVersionInfo.version)
    .map((version) => ({
      version,
      title: migrationFiles[version].title || 'Untitled'
    }));

  return {
    currentVersion: currentVersionInfo.version,
    currentVersionTitle: currentVersionInfo.title,
    latestVersion,
    pendingMigrations
  };
}

async function displayInfo(directory) {
  try {
    const info = await getInfo(directory);

    log('\nMigration Status:');
    log(
      `Current Version: ${info.currentVersion} (${info.currentVersionTitle})`
    );
    log(`Latest Version: ${info.latestVersion}\n`);

    if (info.pendingMigrations.length > 0) {
      log('Pending Migrations:');
      info.pendingMigrations.forEach((migration) => {
        log(`  - Version ${migration.version}: ${migration.title}`);
      });
      log('-------------------\n');
    } else {
      logger.info('No pending migrations. Database is up to date.\n');
    }
  } catch (error) {
    logger.error(`Failed to retrieve migration info: ${error.message}\n`);
  }
}

const program = new Command();

program
  .name('surrealigrate')
  .description(
    'SurrealDB migration CLI tool for managing database schema changes'
  )
  .version('1.0.0')
  .option('-c, --config <path>', 'path to YAML configuration file')
  .option(
    '-d, --dir <path>',
    'directory containing migration files',
    './migrations'
  )
  .addHelpText(
    'after',
    `
Example calls:
  $ npm run migrate
  $ npm run migrate --to 5
  $ npm run rollback
  $ npm run rollback --to 3
  $ npm run info

Configuration:
  This tool can be configured using a YAML file, environment variables, or a combination of both.
  Priority order: Environment Variables > YAML Config > Default Config

Environment Variables:
  DB_URL         SurrealDB connection URL
  DB_USER        Database user
  DB_PASS        Database password
  DB_NAMESPACE   Database namespace
  DB_NAME        Database name

For more information on each command, use: npm run help:[command]
`
  );

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
    await loadConfig(program.opts().config);
    await migrate(program.opts().dir, options.to);
  });

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
    await loadConfig(program.opts().config);
    await rollback(program.opts().dir, options.to);
  });

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
  .action(async (options) => {
    await loadConfig(program.opts().config);
    await displayInfo(program.opts().dir);
  });

await program.parseAsync(process.argv);
process.exit(0);
