# surrealigrate

SurrealDB CLI Migrations for Node.js:

- Versioned migration files such as `0001.do.sql`, `0002.undo.sql`, etc.

- Migrate to the latest version or a specific version using `npm run migrate` or `npm run migrate --to 3`

- Rollback to previous migration or a specific version using `npm run rollback` or `npm run rollback --to 2`

- Display current migration status with pending migrations using `npm run info`

- Built-in help using `npm run help` or `npm run help:[command]` or `npm run [command] -- --help`

- Supports YAML configuration files, environment variables, and a combination of both

**Built with assistance from Claude AI**

## Migrations Folder

The migrations folder defaults to `./migrations` but can be configured using the `-d` or `--dir` option with any command.

## Migration File Naming Convention

- The migration file naming convention is `0001.do.surql` for the first migration, `0002.do.surql` for the second migration, and so on.

- You can also use a title in the migration file name, such as `0001.do.posts.surql` and `0002.undo.posts.surql`.

- The version number is padded with leading zeros to ensure proper sorting order, you can use any number of leading zeros as long as they are consistent throughout the migration files.

- Version numbers simplify to an integer, so you can use --to 3 to specify a migration file that uses `003` in the file name.

- The `do` or `undo` segment indicates whether the file is for a migration (do) or a rollback (undo).

## Configuration

### YAML

```yaml
database:
  url: 'http://127.0.0.1:8000/rpc'
  user: 'root'
  pass: 'root'
  namespace: 'myNamespace'
  dbname: 'myDatabase'
```

### Environment variables

```env
DB_URL=http://127.0.0.1:8000/rpc
DB_USER=myuser
DB_PASS=mypassword
DB_NAMESPACE=myNamespace
DB_NAME=myDatabase
```

## Usage

### Help

```
node index.js --help
```

```
npm run help
```

### Command Help

#### Migrate Help

```
node index.js migrate --help
```

```
npm run migrate -- --help
```

```
npm run help:migrate
```

#### Rollback Help

```
node index.js rollback --help
```

```
npm run rollback -- --help
```

```
npm run help:rollback
```

#### Info Help

```
node index.js info --help
```

```
npm run info -- --help
```

```
npm run help:info
```

### Migrate to the latest version

```
node index.js migrate
```

```
npm run migrate
```

### Migrate to a specific version

```
node index.js migrate --to 3
```

```
npm run migrate -- --to 3
```

### Rollback the last migration

```
node index.js rollback
```

```
npm run rollback
```

### Rollback to a specific version

```
node index.js rollback --to 2
```

```
npm run rollback -- --to 2
```

### Using default configuration

```
node index.js migrate
```

```
npm run migrate
```

### Using a YAML config file

```
node index.js migrate -c ./config.yml
```

```
npm run migrate -- -c ./config.yml
```

### Environment variables will override other configurations

```
DB_USER=admin DB_PASS=secretpassword node index.js migrate
```

```
DB_USER=admin DB_PASS=secretpassword npm run migrate
```

## License

Surrealigrate is licensed under the MIT License. You are free to use it in your projects, commercial or non-commercial, as long as you retain the copyright notice and license text. Please note that the authors of Surrealigrate are not responsible for any damages or losses caused by the use of this software. See the LICENSE file for more details.

## Copyright

Copyright (c) 2024 David Dyess II and contributors. All rights reserved.
