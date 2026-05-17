# 3D FPS

Jednoduchá first-person 3D arénová střílečka postavená na **Three.js** + **Vite**. Aréna obehnaná zdmi, neustále spawnující nepřátelé, HUD a uložitelné nastavení.

## Hra

- **Ovládání**: **WASD** = pohyb, **myš** = mířit, **LMB** = střelba, **Space** = skok, **Esc** = pauza
- **Mechanika**: hitscan střelba (raycaster), pohyb s gravitací a skokem, kolize se zdmi
- **Nepřátelé**: spawn každých ~2.2 s, max 12 současně, ubližují kontaktem
- **HUD**: skóre (+10 za zásah), životy (start 100), počet nepřátel
- **Nastavení**: FOV, citlivost myši, hlasitost — perzistentně v `localStorage`

## Lokální vývoj

### S Vite (HMR)

```bash
npm install
npm run dev      # http://localhost:5173
```

### S Dockerem (produkční build přes Traefik)

Vyžaduje Docker. `make` (bez argumentů) postaví image (Node build → nginx serve), spustí Traefik + nginx, hra běží na **http://3d.localhost**.

```bash
make            # build + start (default target)
make logs       # tail logů
make down       # zastavit a odstranit
make help       # všechny targety
```

Traefik dashboard: http://localhost:8080.

## Deployment

Cílový server: **primus.nadoma.net** (Docker Swarm, externí Traefik), doména **https://3d.nadoma.net**, registry **registry.nadoma.net**.

Předpoklady (jednorázově):

```bash
docker login registry.nadoma.net          # lokálně
ssh admin@primus.nadoma.net docker login registry.nadoma.net   # na serveru
```

Deploy:

```bash
make deploy     # buildx amd64 push → ship resolved stack → docker stack deploy
```

`make deploy`:

1. `docker buildx build --platform linux/amd64 --push` — cross-build z Macu a push do registry s tagy `<commit-hash>` a `latest`
2. `docker compose config` lokálně vyrenderuje a vysubstituuje `docker-compose.yaml` + `docker-compose.deploy.yaml` do hotového stack souboru
3. Stack soubor poslán přes SSH na `/srv/3D-game/docker-stack.yaml`
4. `docker stack deploy --with-registry-auth --prune` na primusu

## Struktura

```
index.html                   HTML shell s HUD, menu a stylem
src/main.js                  herní logika (Three.js scéna, smyčka, vstupy)
package.json                 Vite + three.js dependencies
Dockerfile                   multi-stage: Node build → nginx:alpine
docker-compose.yaml          base — service + Traefik labels
docker-compose.dev.yaml      local — Traefik kontejner + build context
docker-compose.deploy.yaml   prod — externí dmz síť + Swarm deploy
Makefile                     targety pro dev i deploy
```
