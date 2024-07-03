// config.mjs
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
