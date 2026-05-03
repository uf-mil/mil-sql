PROJECT_NAME=mysql_service
COMPOSE=docker-compose -p $(PROJECT_NAME)

# Check if Docker is running
.PHONY: check-docker
check-docker:
	@docker info >nul 2>&1 || (echo. && echo ERROR: Docker is not running. Please start Docker Desktop and try again. && echo. && exit /b 1)

## up:          Start mysql, api (5000), and api-test (5001). Waits briefly and verifies mysql_api is running. Seeding runs inside the API when src.api.app loads (seed_data).
.PHONY: up
up: check-docker
	$(COMPOSE) up -d
	@echo "Waiting for services to be ready..."
	@timeout /t 5 /nobreak >nul 2>&1 || sleep 5 2>/dev/null || true
	@echo Checking API container status...
	@docker inspect mysql_api --format "{{.State.Status}}" 2>nul >nul || (echo. && echo ======================================== && echo ERROR: API container 'mysql_api' does not exist! && echo ======================================== && echo. && echo Try running: make build && echo. && exit /b 1)
	@docker inspect mysql_api --format "{{.State.Status}}" 2>nul | findstr /C:"running" >nul 2>&1 || (echo. && echo ======================================== && echo ERROR: API container is not running! && echo ======================================== && echo. && echo Container status: && docker inspect mysql_api --format "Status: {{.State.Status}} (Exit Code: {{.State.ExitCode}})" 2>nul && echo. && echo Container logs: && echo. && docker logs mysql_api 2>&1 && echo. && echo ======================================== && echo. && exit /b 1)

## up-empty:    docker compose up -d only (no wait or API checks). Seeding still runs when each API process starts (same as up).
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

## mysql-shell:      Open a mysql shell into the mysql container
.PHONY: mysql-shell
mysql-shell: check-docker
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

## milventory:  Start the milventory React app
.PHONY: milventory
milventory:
	@cd milventory && npm install && npm start
