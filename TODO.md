# Surrealigrate

## TODO

- Add missing definitions to `generate`: events, etc.
- Save new migration state in migrations table after `generate`
- Add `analyze` command to preview a generated migration
- Move functions to `/lib` folder, as convenient
- Add Surrealiate submodule?

## Issues

- Large migrations break with "HttpConnectionError: Failed to buffer the request body: length limit exceeded"
- Migrations folder info logs multiple times when running `migrate` or `rollback`
