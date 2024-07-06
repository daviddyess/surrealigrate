/**
 * Surrealigrate
 * @copyright Copyright (c) 2024 David Dyess II
 * @license MIT see LICENSE
 */
import yaml from 'js-yaml';
import 'dotenv/config';
import config from '../config.js';
import { getLogger } from './logger.js';

const logger = getLogger('Configuration');

export async function loadConfig(configPath) {
  try {
    if (configPath) {
      const configFile = await fs.readFile(configPath, 'utf8');
      const yamlConfig = yaml.load(configFile);
      Object.assign(config, yamlConfig);
      logger.info('Loaded from YAML file');
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

    logger.info('Loaded successfully');
  } catch (error) {
    logger.error(`Failed to load configuration: ${error.message}\n`);
    process.exit(1);
  }
}

export default config;
