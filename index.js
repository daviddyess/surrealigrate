/**
 * Surrealigrate
 * @copyright Copyright (c) 2024-2025 David Dyess II
 * @license MIT see LICENSE
 */
import { promises as fs, existsSync, mkdirSync } from 'fs';
import path from 'path';
import config, { loadConfig } from './lib/configuration.js';
import { getLogger } from './lib/logger.js';
import { db, connectToDatabase } from './lib/surrealdb.js';

import { log } from 'console';

await loadConfig();

// Setup logger
const logger = getLogger('SurrealDB');

export async function getMigrationsFolder(folder = undefined) {
  const migrationsFolder =
    folder ?? config?.migrations?.folder ?? './migrations';
  if (!existsSync(migrationsFolder)) {
    logger.warn(`Migrations folder ${migrationsFolder} does not exist`);
    mkdirSync(migrationsFolder, { recursive: true });
    logger.info(`Created migrations folder ${migrationsFolder}`);
  }

  logger.info(`Migrations folder: ${migrationsFolder}`);

  return migrationsFolder?.slice(-1) === '/'
    ? migrationsFolder
    : migrationsFolder + '/';
}

export async function getMigrationFiles(directory) {
  try {
    const files = await fs.readdir(await getMigrationsFolder(directory));
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

export async function getCurrentVersion() {
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

export async function setCurrentVersion(version, title = null) {
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

export async function executeMigration(directory, file, action) {
  const filePath = path.join(await getMigrationsFolder(directory), file);
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

export async function migrate(directory, toVersion = null) {
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
      await executeMigration(directory, doFile, 'do');
      await setCurrentVersion(parseInt(version), title);
    }
  }
}

export async function fastForward(directory) {
  await connectToDatabase();
  const migrationFiles = await getMigrationFiles(directory);
  const currentVersion = await getCurrentVersion();
  const versions = Object.keys(migrationFiles).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );

  const targetVersion = Math.max(...versions.map((v) => parseInt(v)));

  if (targetVersion === currentVersion) {
    logger.info('No pending migrations. Migration state is up to date.\n');
    return;
  }

  for (const version of versions) {
    if (
      parseInt(version) > currentVersion &&
      parseInt(version) <= targetVersion
    ) {
      const { title } = migrationFiles[version];
      logger.info(
        `Fast forwarding to version ${version}${title ? ` (${title})` : ''}`
      );
      await setCurrentVersion(parseInt(version), title);
    }
  }
}

export async function rollback(directory, toVersion = null) {
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
      await executeMigration(directory, undoFile, 'undo');
      await db.query('DELETE migrations WHERE version = $version', {
        version: parseInt(version)
      });
    }
  }
}

export async function getCurrentVersionInfo() {
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

export async function getInfo(directory) {
  await connectToDatabase();
  const migrationFiles = await getMigrationFiles(directory);
  const currentVersionInfo = await getCurrentVersionInfo();

  const versions = Object.keys(migrationFiles).sort(
    (a, b) => parseInt(a) - parseInt(b)
  );
  const latestVersion =
    versions?.length > 0
      ? Math.max(...versions.map((v) => parseInt(v)))
      : '\x1b[33m No migration files found \x1b[0m'; // Yellow

  const pendingMigrations = versions
    .filter((version) => parseInt(version) > currentVersionInfo.version)
    .map((version) => ({
      version,
      title: migrationFiles[version].title || 'Untitled'
    }));

  return {
    currentVersion: `\x1b[34m ${currentVersionInfo.version}\x1b[0m`, // Blue
    currentVersionTitle: currentVersionInfo.title,
    latestVersion:
      latestVersion > currentVersionInfo.version
        ? `\x1b[93m ${latestVersion}\x1b[0m` // Bright Yellow
        : `\x1b[92m ${latestVersion}\x1b[0m`, // Bright Green
    pendingMigrations
  };
}

export async function displayInfo(directory) {
  try {
    const info = await getInfo(directory);

    log('\nMigration Status:');
    log(
      ` Current Version: ${info.currentVersion} (${info.currentVersionTitle})`
    );
    log(`  Latest Version: ${info.latestVersion}\n`);

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
 * Introspect the database and generate migration files
 */
export async function introspectDatabase() {
  logger.info('Introspecting database tables');
  const introspection = {
    definitions: {},
    tables: {},
    version: Date.now() // Using timestamp as version
  };

  // Get all tables
  let dbInfo = await db.query('INFO FOR DB');
  let tables = dbInfo?.[0]?.tables;
  introspection.definitions = tables;
  // Create introspections table if it doesn't exist
  if (!tables?.introspections) {
    await db.query(`
    DEFINE TABLE introspections TYPE NORMAL SCHEMALESS PERMISSIONS NONE;
    DEFINE FIELD data ON introspections TYPE object PERMISSIONS FOR select, create, update, delete WHERE FULL;
    DEFINE FIELD timestamp ON introspections TYPE datetime DEFAULT time::now() PERMISSIONS FOR select, create, update, delete WHERE FULL;
    DEFINE INDEX timestamp ON introspections FIELDS timestamp UNIQUE;
    `);
    logger.info('Created introspections table; Restarting introspection...');
    dbInfo = await db.query('INFO FOR DB');
    tables = dbInfo?.[0]?.tables;
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

export async function saveIntrospection(data) {
  await db.create('introspections', {
    data
  });
  logger.info('Introspection data saved.\n');
}

export async function getLatestIntrospection() {
  const [[latest]] = await db.query(
    'SELECT * FROM introspections ORDER BY timestamp DESC LIMIT 1'
  );
  return latest;
}

export async function getNextMigration() {
  const lastMigration = await getCurrentVersionInfo();
  const newVersion = lastMigration.version + 1;
  const versionLength = [...`${newVersion}`].length;
  const zero = '0';
  const prependZeros = `${zero.repeat((config?.migrations?.digits ?? 3) - 1 - Math.floor(versionLength / 10))}`;
  return `${prependZeros}${newVersion}`;
}
// Function to compare introspections and generate migration files
export async function generateMigration(oldData, newData, title) {
  const MIGRATIONS = await getMigrationsFolder();
  const VERSION = await getNextMigration();
  const TIMESTAMP = new Date().toISOString();
  let doMigration = ``;
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
      // If the table was defined in the old data, use the old definition, if available
      undoMigration = oldData?.definitions?.[tableName]
        ? oldData?.definitions?.[tableName]
        : `DEFINE TABLE ${tableName};\n` + undoMigration;
    } else {
      for (const fieldName in oldData.tables[tableName]?.[0]?.fields) {
        if (!newData.introspection.tables[tableName]?.[0]?.fields[fieldName]) {
          doMigration += `REMOVE FIELD ${fieldName} ON TABLE ${tableName};\n`;
          undoMigration =
            `${oldData.tables[tableName]?.[0]?.fields[fieldName]};\n` +
            undoMigration;
        }
      }
      for (const indexName in oldData.tables[tableName]?.[0]?.indexes) {
        if (!newData.introspection.tables[tableName]?.[0]?.indexes[indexName]) {
          doMigration += `REMOVE INDEX ${indexName} ON TABLE ${tableName};\n`;
          undoMigration =
            `${oldData.tables[tableName]?.[0]?.indexes[indexName]};\n` +
            undoMigration;
        }
      }
    }
  }
  let doFilename;
  if (doMigration.length > 0) {
    if (!title) {
      title = Date.now().toString();
    }
    doFilename = `${VERSION}.do.${title}.surql`;
    doMigration = `-- Migration to apply changes
-- Generated at ${TIMESTAMP}
${doMigration}
`;

    await fs.writeFile(`${MIGRATIONS}${doFilename}`, doMigration);
    undoMigration =
      `-- Migration to revert changes
-- Generated at ${TIMESTAMP}
` + undoMigration;
    const undoFilename = `${VERSION}.undo.${title}.surql`;
    await fs.writeFile(`${MIGRATIONS}${undoFilename}`, undoMigration);

    logger.info(
      `Migration files generated: ${doFilename} and ${undoFilename}\n`
    );
  } else {
    logger.info('No changes detected. No migration files generated.\n');
  }
}
