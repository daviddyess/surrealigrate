/**
 * Surrealigrate
 * @copyright Copyright (c) 2024 David Dyess II
 * @license MIT see LICENSE
 */
import { promises as fs } from 'fs';
import yaml from 'js-yaml';
import 'dotenv/config';
import { getLogger } from './logger.js';

const logger = getLogger('Configuration');

const config = { database: {}, migrations: {} };

export async function loadConfig(configPath) {
  try {
    if (configPath) {
      const configFile = await fs.readFile(configPath, 'utf8');
      const yamlConfig = yaml.load(configFile);
      Object.assign(config, yamlConfig);
      logger.info('Loaded from YAML file');
    }

    // Override with environment variables if they exist
    config.database.url = process.env.SURREAL_URL || config.database.url;
    config.database.user = process.env.SURREAL_USER || config.database.user;
    config.database.pass = process.env.SURREAL_PASS || config.database.pass;
    config.database.namespace =
      process.env.SURREAL_NAMESPACE || config.database.namespace;
    config.database.dbname =
      process.env.SURREAL_DATABASE || config.database.dbname;
    config.database.scope =
      process.env.SURREAL_SCOPE || config.database?.scope || undefined;
    config.migrations.folder =
      process.env.SURREAL_MIGRATIONS_FOLDER || config.migrations?.folder;
    const envDigits = process.env.SURREAL_MIGRATIONS_DIGITS
      ? parseInt(process.env.SURREAL_MIGRATIONS_DIGITS, 10)
      : undefined;
    config.migrations.digits = envDigits || config.migrations.digits;
    logger.info('Configuration loaded successfully');
  } catch (error) {
    logger.error(`Failed to load configuration: ${error.message}\n`);
    process.exit(1);
  }
}

export default config;
