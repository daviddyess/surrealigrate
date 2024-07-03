# Migrations

This directory contains migration files for SurrealDB.

## Naming Convention

Migration files should be named in the format: `<version>.<do|undo>.<title>.surql`

- `<version>` is the version number of the migration
- `<do|undo>` is the action to be performed on the database (do for apply, undo for rollback)
- `<title>` is an optional title for the migration
