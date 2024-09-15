/**
 * Surrealigrate
 * @copyright Copyright (c) 2024 David Dyess II
 * @license MIT see LICENSE
 */
import Surreal from 'surrealdb';
import { getLogger } from './logger.js';
import config from './configuration.js';

const logger = getLogger('SurrealDB');

export const db = new Surreal();

export async function connectToDatabase() {
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
    // Check for existing migrations table
    const setup = await db.query('INFO FOR DB;');
    // Create migrations table if it doesn't exist
    if (!setup?.[0]?.tables?.migrations) {
      await db.query(`
        DEFINE TABLE migrations TYPE NORMAL SCHEMALESS PERMISSIONS NONE;
        DEFINE INDEX version ON migrations FIELDS version UNIQUE;
        `);
      logger.info('Created migrations table');
    }
  } catch (error) {
    logger.error(`Failed to connect to database: ${error.message}\n`);
    process.exit(1);
  }
}
