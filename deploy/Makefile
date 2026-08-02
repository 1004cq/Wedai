ENV_FILE ?= $(CURDIR)/.env.commercial
COMPOSE_FILE := $(CURDIR)/docker-compose.commercial.yml
COMPOSE := docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)

.PHONY: up down config logs ps

up:
	./one-click-up.sh

down:
	./one-click-down.sh

config:
	$(COMPOSE) config --quiet

logs:
	$(COMPOSE) logs -f app

ps:
	$(COMPOSE) ps
