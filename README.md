# Mil-sql - Milventory

Inventory management system for MIL with database-backed storage.

## Prerequisites

**Install Make** (if not already installed):
- **Windows**: Install [Chocolatey](https://chocolatey.org/) then run `choco install make`
- **macOS**: `xcode-select --install` (includes make)
- **Linux**: Usually pre-installed, or `sudo apt-get install make`

**Other Requirements**:
- Docker Desktop
- Node.js and npm (for frontend)
- Python 3 (for backend, installed via Docker)

## Quick Start

1. **Start backend services** (database + API):
   ```bash
   make up
   ```
   This starts MySQL and the Flask API, and seeds initial data.

2. **Start frontend** (in a new terminal):
   ```bash
   make milventory
   ```
   Opens the React app at `http://localhost:3000`

3. **Login**:
   - Email: `test@ufl.edu`
   - Password: `test`

## Available Commands

- `make up` - Start all services and seed data
- `make up-empty` - Start services without seeding
- `make down` - Stop services (keeps data)
- `make clean` - Stop services and remove all data
- `make milventory` - Start React frontend
- `make mysql` - Open MySQL shell
- `make logs` - View service logs
- `make status` - Check service status
- `make help` - Show all commands

## Project Structure

- `milventory/` - React frontend application
- `src/api/` - Flask backend API
- `src/tables/` - Database schema definitions (`table_*.sql` per domain)
- `src/scripts/` - Database seeding and utility scripts

## Development

The backend API runs on `http://localhost:5000` and the frontend proxies API requests automatically during development.

