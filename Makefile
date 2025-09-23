PROJECT_NAME=postgres_service
COMPOSE=docker-compose -p $(PROJECT_NAME)

## up:          Start the postgres and app containers in the background
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

## psql:        Open a psql shell into the postgres container
.PHONY: psql
psql:
	$(COMPOSE) exec db psql -U postgres -d mydb

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
