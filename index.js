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
/**
 * Main command line interface
 */
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
    await loadConfig(program.opts().config);
    await migrate(program.opts().dir, options.to);
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
    await loadConfig(program.opts().config);
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
  .action(async (options) => {
    await loadConfig(program.opts().config);
    await displayInfo(program.opts().dir);
  });
/**
 * Introspect the database and generate migration files
 */

// Function to introspect the database
async function introspectDatabase() {
  logger.info('Introspecting database tables');
  const introspection = {
    tables: {},
    version: Date.now() // Using timestamp as version
  };

  // Get all tables
  const dbInfo = await db.query('INFO FOR DB');
  const tables = dbInfo?.[0]?.tables;
  // Create introspections table if it doesn't exist
  if (!tables?.introspections) {
    await db.query(`
    DEFINE TABLE introspections TYPE NORMAL SCHEMALESS PERMISSIONS NONE;
    DEFINE FIELD data ON introspections TYPE object PERMISSIONS FOR select, create, update, delete WHERE FULL;
    DEFINE FIELD timestamp ON introspections TYPE datetime DEFAULT time::now() PERMISSIONS FOR select, create, update, delete WHERE FULL;
    DEFINE INDEX timestamp ON introspections FIELDS timestamp UNIQUE;
    `);
    logger.info('Created introspections table');
  }
  // Get table info
  let tableCount = 0;
  log('\n Collecting database table information:');
  for (const table of Object.keys(tables)) {
    log(`  - Table ${table}...`);
    introspection.tables[table] = await db.query(`INFO FOR TABLE ${table}`);
    tableCount++;
  }
  log('  -------------------');
  log(` ${tableCount} tables extracted\n`);
  logger.info(`Introspection complete`);

  return { dbInfo, dbTables: tables, introspection };
}

// Function to save introspection data
async function saveIntrospection(data) {
  await db.create('introspections', {
    data
  });
  logger.info('Introspection data saved.\n');
}

// Function to get the latest introspection
async function getLatestIntrospection() {
  const [[latest]] = await db.query(
    'SELECT * FROM introspections ORDER BY timestamp DESC LIMIT 1'
  );
  return latest;
}

// Function to compare introspections and generate migration files
async function generateMigration(oldData, newData) {
  const timestamp = new Date().toISOString();
  let doMigration = `-- Migration to apply changes
-- Generated at ${timestamp}
`;
  let undoMigration = ``;

  // Compare tables
  for (const tableName of Object.keys(newData.dbTables)) {
    if (!oldData.tables[tableName]) {
      doMigration += `${newData.dbTables[tableName]};\n`;
      undoMigration = `REMOVE TABLE ${tableName};\n` + undoMigration;
    }

    // Compare fields
    for (const fieldName in newData.introspection.tables[tableName][0]
      ?.fields) {
      if (!oldData.tables[tableName]?.[0]?.fields[fieldName]) {
        doMigration += `${newData.introspection.tables[tableName]?.[0]?.fields[fieldName]};\n`;
        if (oldData.tables[tableName]) {
          undoMigration =
            `REMOVE FIELD ${fieldName} ON TABLE ${tableName};\n` +
            undoMigration;
        }
      }
    }

    // Compare indexes
    for (const indexName in newData.introspection.tables[tableName][0]
      .indexes) {
      if (!oldData.tables[tableName]?.[0]?.indexes[indexName]) {
        const index =
          newData.introspection.tables[tableName]?.[0]?.indexes[indexName];
        const uniqueStr = index.unique ? 'UNIQUE ' : '';
        doMigration += `${newData.introspection.tables[tableName]?.[0]?.indexes[indexName]};\n`;
        if (oldData.tables[tableName]) {
          undoMigration =
            `REMOVE INDEX ${indexName} ON TABLE ${tableName};\n` +
            undoMigration;
        }
      }
    }
  }

  // Check for removed tables, fields, and indexes
  for (const tableName in oldData.tables) {
    if (!newData.introspection.tables[tableName]) {
      doMigration += `REMOVE TABLE ${tableName};\n`;
      undoMigration = `DEFINE TABLE ${tableName};\n` + undoMigration;
    } else {
      for (const fieldName in oldData.tables[tableName]?.[0]?.fields) {
        if (!newData.introspection.tables[tableName]?.[0]?.fields[fieldName]) {
          doMigration += `REMOVE FIELD ${fieldName} ON TABLE ${tableName};\n`;
          const fieldType =
            oldData.tables[tableName]?.[0]?.fields[fieldName].type;
          undoMigration =
            `DEFINE FIELD ${fieldName} ON TABLE ${tableName} TYPE ${fieldType};\n` +
            undoMigration;
        }
      }
      for (const indexName in oldData.tables[tableName]?.[0]?.indexes) {
        if (!newData.introspection.tables[tableName]?.[0]?.indexes[indexName]) {
          doMigration += `REMOVE INDEX ${indexName} ON TABLE ${tableName};\n`;
          const index = oldData.tables[tableName]?.[0]?.indexes[indexName];
          const uniqueStr = index.unique ? 'UNIQUE ' : '';
          undoMigration =
            `DEFINE ${uniqueStr}INDEX ${indexName} ON TABLE ${tableName} FIELDS ${index.fields.join(', ')};\n` +
            undoMigration;
        }
      }
    }
  }

  await fs.writeFile('migration_do.surql', doMigration);

  undoMigration =
    `-- Migration to revert changes
-- Generated at ${timestamp}
` + undoMigration;

  await fs.writeFile('migration_undo.surql', undoMigration);

  logger.info(
    'Migration files generated: migration_do.surql and migration_undo.surql'
  );
}

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
  .action(async (options) => {
    await loadConfig(program.opts().config);
    await connectToDatabase();
    const introspectionData = await introspectDatabase();
    await saveIntrospection(introspectionData);
  });

program
  .command('generate')
  .description(
    'Analyze the updated database state, generate migration files, and update stored introspection data'
  )
  .addHelpText(
    'after',
    `
Example:
  $ npm run generate

This command will:
  - Analyze the updated database state
  - Generate migration files
  - Store introspection data in the database
  `
  )
  .action(async (options) => {
    await loadConfig(program.opts().config);
    await connectToDatabase();
    const latestIntrospection = await getLatestIntrospection();
    const currentIntrospection = await introspectDatabase();
    await generateMigration(latestIntrospection.data, currentIntrospection);
    //await saveIntrospection(currentIntrospection);
  });

await program.parseAsync(process.argv);
process.exit(0);
