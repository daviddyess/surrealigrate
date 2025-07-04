# surrealigrate

SurrealDB CLI Migrations for Node.js:

- Edit your database in Surrealist, then generate a migration with Surrealigrate
- Versioned migration files such as `0001.do.sql`, `0002.undo.sql`, etc.
- Migrate to the latest version or a specific version
- Rollback to previous migration or a specific version
- Display current migration status with pending migrations
- Built-in help
- Supports YAML configuration files, environment variables, and a combination of both

## Installation

Using npm:

```bash
npm install surrealigrate --save-dev
```

## Development Workflow

1. Create your database
2. Run `npx surrealdb info` to verify your database
3. Run `npx surrealdb extract` to create an introspection snapshot
4. Make changes to your database schema in Surrealist
5. Run `npx surrealdb generate -n test` to create a migration files, such as `0001.do.test.surql` and `0001.undo.test.surql`
6. Run `npx surrealdb fastforward` to do a version only migration (you already made the changes manually)
7. Use `npx surrealdb rollback` followed by `npx surrealdb migrate` to test your migration
8. Repeat steps 3 - 7

## Production Workflow

1. Create your database
2. Run `npx surrealdb info` to verify your database
3. Run `npx surrealdb migrate`

## Migrations Folder

The migrations folder defaults to `./migrations` but can be configured using the `-d` or `--dir` option with any command or in a configuration file.

## Migration File Naming Convention

- The migration file naming convention is `0001.do.surql` for the first migration, `0002.do.surql` for the second migration, and so on.
- You can also use a title in the migration file name, such as `0001.do.posts.surql` and `0002.undo.posts.surql`.
- The version number is padded with leading zeros to ensure proper sorting order, you can use any number of leading zeros as long as they are consistent throughout the migration files.
- Version numbers simplify to an integer, so you can use --to 3 to specify a migration file that uses `003` in the file name.
- Version numbers can be configured using the `digits` setting for generated migrations to follow your naming convention.
- The `do` or `undo` segment indicates whether the file is for a migration (do) or a rollback (undo).

## Configuration

### YAML

```yaml
database:
  url: 'http://127.0.0.1:8000/rpc'
  user: 'myuser'
  pass: 'mypassword'
  namespace: 'myNamespace'
  dbname: 'myDatabase'
migrations:
  folder: './migrations'
  digits: 4
```

### Environment variables

```env
SURREAL_URL=http://127.0.0.1:8000/rpc
SURREAL_USER=myuser
SURREAL_PASS=mypassword
SURREAL_NAMESPACE=myNamespace
SURREAL_DATABASE=myDatabase
SURREAL_MIGRATIONS_DIGITS=4
SURREAL_MIGRATIONS_FOLDER='./migrations'
```

## Usage

### Help

```
npx surrealdb --help
```

### Command Help

#### Extract Help

```
npx surrealdb extract --help
```

#### Generate Help

```
npx surrealdb generate --help
```

#### Migrate Help

```
npx surrealdb migrate -- --help
```

#### Rollback Help

```
npx surrealdb rollback --help
```

#### Info Help

```
npx surreald info --help
```

### Extract a Snapshot

- Creates an introspection snapshot to be used when generating the next migration
- Must be manually ran between each generated migration

```
npx surrealdb extract
```

### Generate a Migration

- Can be ran multiple times to override a new migration during development
- Requires a snapshot of the previous migration to be created using `extract`

```
npx surrealdb generate
```

### Migrate to the Latest Version

```
npx surreald migrate
```

### Migrate to a Specific Version

```
npx surreald migrate --to 3
```

- `3` is migration up to 0003.do.surql
- Includes any migrations prior to the specified version

### Fast Forward

- Migrate version without changing database schema
- Useful during development; generate a migration from introspection, then skip to the correct migration status with `fastforward`

```
npx surrealdb fastforward
```

### Rollback the Last Migration

- Useful during development; fastforward then use rollback, finally perform a test migration

```
npx surreald rollback
```

### Rollback to a Specific Version

```
npx surreald rollback --to 2
```

- `2` rollsback  down to 0002.undo.surql
- Removes any migrations after the specified version

### Using default configuration

```
npx surreald migrate
```

### Using a YAML config file

```
npx surreald migrate -c ./config.yml
```

### Environment variables will override other configurations

```
DB_USER=admin DB_PASS=secretpassword npx surreald migrate
```

## Logs

A `migrations.log` file will be created in the `/logs folder to log all migration activity.

## License

Surrealigrate is licensed under the MIT License. You are free to use it in your projects, commercial or non-commercial, as long as you retain the copyright notice and license text. Please note that the authors of Surrealigrate are not responsible for any damages or losses caused by the use of this software. See the LICENSE file for more details.

## Copyright

Copyright (c) 2024-2025 David Dyess II and contributors. All rights reserved.
