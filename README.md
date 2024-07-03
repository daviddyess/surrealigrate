# surrealigrate

SurrealDB CLI Migrations for Node.js

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
npm run migrate --to 3
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
npm run rollback --to 2
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
