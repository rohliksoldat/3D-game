# 3D FPS — local dev via Traefik, deploy to Docker Swarm.
# Variable names mirror the GitHub Actions project variables (see
# .github/workflows/{build,deploy}.yaml).

STACK_NAME              ?= 3d-game
REGISTRY_HOST           ?= registry.nadoma.net
IMAGE_TAG               ?= $(shell git rev-parse --short HEAD)

export IMAGE_URL        ?= $(REGISTRY_HOST)/$(STACK_NAME)
export PUBLISH_DOMAIN   ?= 3d.localhost

DEPLOY_HOST             ?= primus.nadoma.net
DEPLOY_SSH_USER         ?= admin
DEPLOY_DIR              ?= /srv/3D-game
DEPLOY_PUBLISH_DOMAIN   ?= 3d.nadoma.net

COMPOSE_DEV := -f docker-compose.yaml -f docker-compose.dev.yaml

.PHONY: help build start build-and-start stop down logs push deploy

.DEFAULT_GOAL := build-and-start

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

### Local development

build: ## Build local image
	docker compose $(COMPOSE_DEV) build

start: ## Start Traefik + game on http://$(PUBLISH_DOMAIN)
	docker compose $(COMPOSE_DEV) up --detach --remove-orphans
	@echo "Running at http://$(PUBLISH_DOMAIN)"

build-and-start: build start ## Build and start (default target)

stop: ## Stop containers
	docker compose $(COMPOSE_DEV) stop

down: ## Remove containers and network
	docker compose $(COMPOSE_DEV) down --remove-orphans

logs: ## Tail container logs
	docker compose $(COMPOSE_DEV) logs --follow

### Production deployment to $(DEPLOY_SSH_USER)@$(DEPLOY_HOST)

push: ## Build prod image for linux/amd64 and push to $(IMAGE_URL)
	docker buildx build --platform linux/amd64 \
		-t $(IMAGE_URL):$(IMAGE_TAG) \
		-t $(IMAGE_URL):latest \
		--push .

deploy: push ## Push image, ship resolved stack file, deploy
	PUBLISH_DOMAIN=$(DEPLOY_PUBLISH_DOMAIN) \
		docker compose -f docker-compose.yaml -f docker-compose.deploy.yaml config \
		| sed '/^name:/d' \
		| ssh $(DEPLOY_SSH_USER)@$(DEPLOY_HOST) "mkdir -p $(DEPLOY_DIR) \
			&& cat > $(DEPLOY_DIR)/docker-stack.yaml \
			&& cd $(DEPLOY_DIR) \
			&& docker stack deploy --with-registry-auth --prune \
				-c docker-stack.yaml $(STACK_NAME)"
	@echo "Deployed $(IMAGE_TAG) to https://$(DEPLOY_PUBLISH_DOMAIN)"
