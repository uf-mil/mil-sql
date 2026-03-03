PROJECT_NAME=mysql_service
COMPOSE=docker-compose -p $(PROJECT_NAME)

# Check if Docker is running
.PHONY: check-docker
check-docker:
	@docker info >nul 2>&1 || (echo. && echo ERROR: Docker is not running. Please start Docker Desktop and try again. && echo. && exit /b 1)

## up:          Start the mysql, api (port 5000), and api-test (port 5001) containers and seed default locations
.PHONY: up
up: check-docker
	$(COMPOSE) up -d
	@echo "Waiting for services to be ready..."
	@timeout /t 5 /nobreak >nul 2>&1 || sleep 5 2>/dev/null || true
	@$(COMPOSE) exec api python src/scripts/seed_locations.py

## up-empty:    Start the mysql, api (port 5000), and api-test (port 5001) containers without seeding data
.PHONY: up-empty
up-empty: check-docker
	$(COMPOSE) up -d

## down:        Stop and remove containers (keeps volumes)
.PHONY: down
down: check-docker
	$(COMPOSE) down

## status:      Show status of all services
.PHONY: status
status: check-docker
	$(COMPOSE) ps

## logs:        Follow logs from all services
.PHONY: logs
logs: check-docker
	$(COMPOSE) logs -f

## mysql:      Open a mysql shell into the mysql container
.PHONY: mysql
mysql: check-docker
	$(COMPOSE) exec db mysql -u mysqluser -pmysqlpassword mydb

## build:       Build or rebuild services
.PHONY: build
build: check-docker
	$(COMPOSE) build

## clean:       Remove containers, networks, volumes, and orphans
.PHONY: clean
clean: check-docker
	$(COMPOSE) down -v --remove-orphans
	docker volume prune -f

## install:     Install docker, docker-compose, and python deps (Ubuntu/Debian)
.PHONY: install
install:
	sudo apt-get update
	sudo apt-get install -y docker.io docker-compose make python3-pip
	pip3 install -r requirements.txt

## locations:   Generate inventory-locations.json from generate-locations.js
.PHONY: locations
locations:
	@cd milventory && node generate-locations.js

## milventory:  Start the milventory React app
.PHONY: milventory
milventory:
	@cd milventory && npm install && npm start

## test-api:    Run history API integration tests
.PHONY: test-api
test-api:
	@echo Installing test dependencies...
	@if not exist tests\node_modules (cd tests & npm install)
	@echo Running history API tests...
	@cd tests & node test-history-api.js

## help:        Show this help menu
help:
	@echo "Available commands:"
	@grep -E '^##' Makefile | sed 's/## //'
