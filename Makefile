PROJECT_NAME=mysql_service
COMPOSE=docker-compose -p $(PROJECT_NAME)

## up:          Start the mysql and app containers in the background
.PHONY: up
up:
	$(COMPOSE) up -d

## down:        Stop and remove containers (keeps volumes)
.PHONY: down
down:
	$(COMPOSE) down

## logs:        Follow logs from all services
.PHONY: logs
logs:
	$(COMPOSE) logs -f

## mysql:      Open a mysql shell into the mysql container
.PHONY: mysql
mysql:
	$(COMPOSE) exec db mysql -u mysqluser -pmysqlpassword mydb

## test:       Run table creation tests in a test database
.PHONY: test
test:
	$(COMPOSE) exec app python src/scripts/test_tables.py

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
