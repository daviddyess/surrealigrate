/**
 * Surrealigrate
 * @copyright Copyright (c) 2024 David Dyess II
 * @license MIT see LICENSE
 */
export default {
  database: {
    url: process.env.DB_URL,
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
    namespace: process.env.DB_NAMESPACE,
    dbname: process.env.DB_NAME,
    scope: process.env.DB_SCOPE
  }
};
