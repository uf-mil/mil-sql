PROJECT_NAME=mysql_service
COMPOSE=docker-compose -p $(PROJECT_NAME)

## up:          Start the mysql, api (port 5000), and api-test (port 5001) containers and seed default locations
.PHONY: up
up:
	$(COMPOSE) up -d
	@echo "Waiting for services to be ready..."
	@timeout /t 5 /nobreak >nul 2>&1 || sleep 5 2>/dev/null || true
	@$(COMPOSE) exec api python src/scripts/seed_locations.py

## up-empty:    Start the mysql, api (port 5000), and api-test (port 5001) containers without seeding data
.PHONY: up-empty
up-empty:
	$(COMPOSE) up -d

## down:        Stop and remove containers (keeps volumes)
.PHONY: down
down:
	$(COMPOSE) down

## status:      Show status of all services
.PHONY: status
status:
	$(COMPOSE) ps

## logs:        Follow logs from all services
.PHONY: logs
logs:
	$(COMPOSE) logs -f

## mysql:      Open a mysql shell into the mysql container
.PHONY: mysql
mysql:
	$(COMPOSE) exec db mysql -u mysqluser -pmysqlpassword mydb

## test:       Open GUI test runner (starts services if not running, including test API on port 5001)
.PHONY: test
test:
	@echo "Ensuring services are running..."
	@$(COMPOSE) up -d
	@echo "Waiting for services to be ready..."
	@timeout /t 5 /nobreak >nul 2>&1 || sleep 5 2>/dev/null || true
	@python src/scripts/test_gui.py

## build:       Build or rebuild services
.PHONY: build
build:
	$(COMPOSE) build

## clean:       Remove containers, networks, volumes, and orphans
.PHONY: clean
clean:
	$(COMPOSE) down -v --remove-orphans
	docker volume prune -f

## install:     Install docker, docker-compose, and python deps (Ubuntu/Debian)
.PHONY: install
install:
	sudo apt-get update
	sudo apt-get install -y docker.io docker-compose make python3-pip
	pip3 install -r requirements.txt

## help:        Show this help menu
help:
	@echo "Available commands:"
	@grep -E '^##' Makefile | sed 's/## //'
