import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import Surreal from 'surrealdb.js';
import winston from 'winston';
import yaml from 'js-yaml';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

import config from './config.js';

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'migration.log' })
  ]
});

const db = new Surreal();

async function loadConfig(configPath) {
  try {
    if (configPath) {
      const configFile = await fs.readFile(configPath, 'utf8');
      const yamlConfig = yaml.load(configFile);
      Object.assign(config, yamlConfig);
      logger.info('Configuration loaded from YAML file');
    }

    // Override with environment variables if they exist
    config.database.url = process.env.DB_URL || config.database.url;
    config.database.user = process.env.DB_USER || config.database.user;
    config.database.pass = process.env.DB_PASS || config.database.pass;
    config.database.namespace =
      process.env.DB_NAMESPACE || config.database.namespace;
    config.database.dbname = process.env.DB_NAME || config.database.dbname;
    config.database.scope =
      process.env.DB_SCOPE || config.database?.scope || undefined;

    logger.info('Configuration loaded successfully');
  } catch (error) {
    logger.error(`Failed to load configuration: ${error.message}`);
    process.exit(1);
  }
}

async function connectToDatabase() {
  try {
    // Connect to the database
    await db.connect(config.database.url);

    // Select a specific namespace / database
    await db.use({
      namespace: config.database.namespace,
      database: config.database.dbname
    });

    // Signin as a namespace, database, or root user
    await db.signin({
      username: config.database.user,
      password: config.database.pass
    });

    logger.info('Connected to database successfully');

    const setup = await db.query('INFO FOR DB;');
    if (!setup?.tables?.migrations) {
      await db.query(
        'DEFINE TABLE migrations TYPE NORMAL SCHEMALESS PERMISSIONS NONE;'
      );
      logger.info('Created migrations table');
    }
  } catch (error) {
    logger.error(`Failed to connect to database: ${error.message}`);
    process.exit(1);
  }
}

async function getMigrationFiles(directory) {
  try {
    console.log(files);
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
    logger.error(`Failed to read migration files: ${error.message}`);
    process.exit(1);
  }
}

async function getCurrentVersion() {
  try {
    const result = await db.query(
      'SELECT * FROM migrations ORDER BY version DESC LIMIT 1'
    );
    return result[0]?.result?.[0]?.version || 0;
  } catch (error) {
    logger.error(`Failed to get current version: ${error.message}`);
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
      logger.info(`Set current version to ${version} (${title})`);
    } else {
      await db.query('CREATE migrations SET version = $version', {
        version
      });
      logger.info(`Set current version to ${version}`);
    }
  } catch (error) {
    logger.error(`Failed to set current version: ${error.message}`);
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
      `Failed to ${action === 'do' ? 'apply' : 'revert'} migration ${path.basename(filePath)}: ${error.message}`
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
      `Current version (${currentVersion}) is higher than target version (${targetVersion}). Use rollback instead.`
    );
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
      `Target version (${targetVersion}) is not lower than current version (${currentVersion}). Use migrate instead.`
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
      const previousVersion = parseInt(version) - 1;
      const previousTitle = versions.includes(previousVersion.toString())
        ? migrationFiles[previousVersion.toString()].title
        : null;
      await setCurrentVersion(previousVersion, previousTitle);
    }
  }
}

async function getCurrentVersionInfo() {
  try {
    const result = await db.query(
      'SELECT * FROM migrations ORDER BY version DESC LIMIT 1'
    );
    return (
      result[0]?.result?.[0] || { version: 0, title: 'No migrations applied' }
    );
  } catch (error) {
    logger.error(`Failed to get current version info: ${error.message}`);
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

    console.log('\nMigration Status:');
    console.log(
      `Current Version: ${info.currentVersion} (${info.currentVersionTitle})`
    );
    console.log(`Latest Version: ${info.latestVersion}`);

    if (info.pendingMigrations.length > 0) {
      console.log('\nPending Migrations:');
      info.pendingMigrations.forEach((migration) => {
        console.log(`  - Version ${migration.version}: ${migration.title}`);
      });
    } else {
      console.log('\nNo pending migrations. Database is up to date.');
    }
  } catch (error) {
    logger.error(`Failed to retrieve migration info: ${error.message}`);
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
  .option(
    '-d, --directory <path>',
    'directory containing migration files',
    './migrations'
  )
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
    await migrate(options.directory, options.to);
  });

program
  .command('rollback')
  .description('Rollback applied migrations')
  .option(
    '-d, --directory <path>',
    'directory containing migration files',
    './migrations'
  )
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
    await rollback(options.directory, options.to);
  });

program
  .command('info')
  .description('Display information about the current migration status')
  .option(
    '-d, --directory <path>',
    'directory containing migration files',
    './migrations'
  )
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
    await displayInfo(options.directory);
  });

program.parse(process.argv);
