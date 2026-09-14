# doomee

> **Do. Track. Show.** — Turn work into visible results.

SaaS multi-tenant de gestion de projets et de **mesure des résultats**.

```
OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → ANALYSE → INSIGHT → RECOMMANDATION → PROCHAINE ACTION
```

## Démarrage

```bash
pnpm install
cp .env.example .env
pnpm db:up          # PostgreSQL 16 + MinIO
pnpm db:migrate
pnpm dev            # http://localhost:3000/fr
```

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Serveur de développement, build, production |
| `pnpm db:up` / `pnpm db:down` | Services locaux (PostgreSQL, MinIO) |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` | Migrations et données de référence |
| `pnpm test` / `pnpm test:integration` / `pnpm test:e2e` | Unitaires · base réelle · Playwright |
| `pnpm lint` / `pnpm typecheck` | Biome · TypeScript strict |
| `pnpm check:i18n` / `pnpm check:boundaries` | Chaînes en dur · frontières de modules |
| `pnpm verify` | Toute la chaîne, dans l'ordre de la CI |

## Documentation

Lire **[`CLAUDE.md`](./CLAUDE.md)** en premier : c'est la mémoire du projet.

| Document | Contenu |
|---|---|
| [`docs/cahier-des-charges.md`](./docs/cahier-des-charges.md) | Le **quoi** : périmètre, rôles, permissions, flux |
| [`docs/architecture.md`](./docs/architecture.md) | Le **comment** : stack, multi-tenant, sécurité, i18n, tests |
| [`docs/database.md`](./docs/database.md) | Le schéma complet et les politiques RLS |
| [`docs/roadmap.md`](./docs/roadmap.md) | Les 15 lots et leur définition de « terminé » |
| [`docs/decisions.md`](./docs/decisions.md) | Le **pourquoi** : 26 ADR |

## État

**LOT 0 — socle technique.** Aucune fonctionnalité métier, aucune table : le LOT 1
(tenancy, authentification, RLS) est la prochaine étape.
