# MySQL Service Setup

This project provides a simple Dockerized MySQL database and a Python service for interacting with it.

---

## Requirements
- Docker (>= 20.10)
- Docker Compose (v2 recommended)
- Make (optional, for convenience)

---

## Setup

### 1. Build and start services
```bash
make up
```

This will:
- Start a MySQL 8.0 database container
- Initialize the database schema (idempotent - safe to run multiple times)

---

## Database Initialization

The startup script (`src/scripts/app.py`) handles database schema initialization automatically. It:

1. **Creates tables** in the correct dependency order (idempotent)
2. **Only creates tables that don't exist** - safe to run multiple times
3. **Never drops existing data** - production-safe

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `mysql://mysqluser:mysqlpassword@db:3306/mydb` | MySQL connection string |

### Separate Scripts

- **Seed data**: Use separate seed scripts (to be added) for inserting test data
- **Database reset**: Use separate reset scripts (to be added) for dropping/recreating tables

---

## Database Schema

The database includes the following tables:
- `teams` - Team definitions
- `locations` - Storage locations
- `members` - Team members
- `weekly_reports` - Member progress reports
- `supplies` - Inventory items
- `orders` - Purchase orders
- `applicants` - Applicant information

See `src/sql/` for table definitions.