# 3D FPS — local dev via Traefik, deploy to primus.nadoma.net (Docker Swarm)

STACK_NAME           ?= 3d-game
export PUBLISH_URL   ?= 3d.localhost
export IMAGE_URL     ?= registry.nadoma.net/3d-game
export IMAGE_TAG     ?= $(shell git rev-parse --short HEAD)

PROD_HOST            ?= admin@primus.nadoma.net
PROD_DIR             ?= /srv/3D-game
PROD_PUBLISH_URL     ?= 3d.nadoma.net

COMPOSE_DEV := -f docker-compose.yaml -f docker-compose.dev.yaml

.PHONY: help build start build-and-start stop down logs push deploy

.DEFAULT_GOAL := build-and-start

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

### Local development

build: ## Build local image
	docker compose $(COMPOSE_DEV) build

start: ## Start Traefik + game on http://$(PUBLISH_URL)
	docker compose $(COMPOSE_DEV) up --detach --remove-orphans
	@echo "Running at http://$(PUBLISH_URL)"

build-and-start: build start ## Build and start (default target)

stop: ## Stop containers
	docker compose $(COMPOSE_DEV) stop

down: ## Remove containers and network
	docker compose $(COMPOSE_DEV) down --remove-orphans

logs: ## Tail container logs
	docker compose $(COMPOSE_DEV) logs --follow

### Production deployment to $(PROD_HOST)

push: ## Build prod image for linux/amd64 and push to $(IMAGE_URL)
	docker buildx build --platform linux/amd64 \
		-t $(IMAGE_URL):$(IMAGE_TAG) \
		-t $(IMAGE_URL):latest \
		--push .

deploy: push ## Push image, ship resolved stack file to $(PROD_HOST), deploy
	PUBLISH_URL=$(PROD_PUBLISH_URL) \
		docker compose -f docker-compose.yaml -f docker-compose.deploy.yaml config \
		| sed '/^name:/d' \
		| ssh $(PROD_HOST) "mkdir -p $(PROD_DIR) \
			&& cat > $(PROD_DIR)/docker-stack.yaml \
			&& cd $(PROD_DIR) \
			&& docker stack deploy --with-registry-auth --prune \
				-c docker-stack.yaml $(STACK_NAME)"
	@echo "Deployed $(IMAGE_TAG) to https://$(PROD_PUBLISH_URL)"
