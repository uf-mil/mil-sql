# Mil-SQL API Service

This project provides a Dockerized MySQL database with a Flask REST API for managing locations and supplies inventory.

---

## Requirements
- Docker (>= 20.10)
- Docker Compose (v2 recommended)
- Make (optional, for convenience)
- Python 3.11+ (for local test GUI)

---

## Setup

### 1. Build and start services
```bash
make up
```

This will:
- Start a MySQL 8.0 database container
- Start a Flask API container on port 5000 (production database: `mydb`)
- Start a Flask API container on port 5001 (test database: `mydb_test`)
- Automatically initialize the database schema for both APIs (idempotent - safe to run multiple times)

### 2. Run tests
```bash
make test
```

Opens a GUI test runner that allows you to:
- Validate table creation
- Test locations and supplies data insertion
- Interactively move supplies between containers

---

## API Endpoints

The Flask API runs on two ports:
- **Production API**: `http://localhost:5000` (database: `mydb`)
- **Test API**: `http://localhost:5001` (database: `mydb_test`)

Both APIs provide the same endpoints:

### Locations
- `GET /api/locations` - Get all locations
- `GET /api/locations/<name>` - Get a specific location
- `POST /api/locations` - Create a new location
- `PUT /api/locations/<name>` - Update a location
- `DELETE /api/locations/<name>` - Delete a location

### Supplies
- `GET /api/supplies` - Get all supplies (optional `?location=<name>` filter)
- `GET /api/supplies/<id>` - Get a specific supply
- `POST /api/supplies` - Create/update a supply (adds to existing if same name+location)
- `PUT /api/supplies/<id>` - Update supply amount or last_order_date
- `DELETE /api/supplies/<id>` - Delete a supply
- `POST /api/supplies/move` - Move supplies between locations

### Health Check
- `GET /health` - API health status

---

## Database Initialization

The Flask API (`src/api/app.py`) handles database schema initialization automatically on startup. It:

1. **Creates tables** in the correct dependency order (idempotent)
2. **Only creates tables that don't exist** - safe to run multiple times
3. **Never drops existing data** - production-safe
4. **Handles dependencies** - automatically sorts tables by foreign key relationships

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `mysql://mysqluser:mysqlpassword@db:3306/mydb` | MySQL connection string |
| `DB_HOST` | `db` | Database hostname |
| `DB_PORT` | `3306` | Database port |
| `DB_USER` | `mysqluser` | Database username |
| `DB_PASSWORD` | `mysqlpassword` | Database password |
| `DB_NAME` | `mydb` | Database name |
| `PORT` | `5000` | Flask API port |
| `MYSQL_ROOT_PASSWORD` | `rootpassword` | MySQL root password |

---

## Testing

### Test API

A separate test API instance runs on port 5001 and connects to the `mydb_test` database. This allows test scripts to:
- Use the API endpoints without affecting production data
- Test API functionality in isolation
- Access the test database through the same API interface as production

Test scripts can use the `TEST_API_URL` constant from `helpers.py`:
```python
from helpers import TEST_API_URL
import requests

# Use test API (http://localhost:5001/api)
response = requests.get(f"{TEST_API_URL}/locations")
```

### Test Scripts

- **`test_tables.py`** - Validates table creation in a test database
- **`test_locations_supplies.py`** - Tests locations and supplies with interactive GUI
- **`test_gui.py`** - GUI test runner that discovers and runs all test scripts

### Running Tests

```bash
make test
```

This opens a GUI window where you can:
- Run individual tests
- Run all tests
- View test results in real-time
- See table contents in interactive viewers

**Note**: The test API (`api-test` service) starts automatically with `make up` or `make test` and connects to the `mydb_test` database.

---

## Database Schema

The database includes the following tables:
- `teams` - Team definitions
- `locations` - Storage locations (with coordinates for frontend positioning)
- `members` - Team members
- `weekly_reports` - Member progress reports
- `supplies` - Inventory items (with unique constraint on name+location)
- `orders` - Purchase orders
- `applicants` - Applicant information

### Key Features

- **Supplies normalization**: Each supply can exist in multiple locations with different amounts
- **Unique constraint**: `(name, location)` ensures no duplicate supply entries per location
- **Foreign keys**: Supplies reference locations, maintaining referential integrity

See `src/sql/` for table definitions.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop all services |
| `make build` | Build or rebuild services |
| `make test` | Run GUI test runner |
| `make mysql` | Open MySQL shell |
| `make logs` | View service logs |
| `make status` | Show service status |
| `make clean` | Remove containers, volumes, and networks |

---

## Project Structure

```
mil-sql/
├── src/
│   ├── api/              # Flask API application
│   │   ├── app.py        # Main Flask app
│   │   ├── db.py         # Database connection pool
│   │   ├── models/       # Data models
│   │   └── routes/       # API route handlers
│   ├── scripts/          # Utility and test scripts
│   │   ├── helpers.py    # Shared database helpers
│   │   ├── test_gui.py   # GUI test runner
│   │   ├── test_tables.py
│   │   └── test_locations_supplies.py
│   └── sql/              # SQL table definitions
│       └── */table_*.sql
├── docker-compose.yaml   # Service definitions
├── Dockerfile            # Python API container
├── requirements.txt      # Python dependencies
└── Makefile             # Convenience commands
```