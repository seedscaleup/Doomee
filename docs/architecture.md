# Doomee — Architecture technique

> **Statut** : proposition en attente de validation
> Ce document fait autorité sur le « comment ». Le « quoi » est dans `docs/cahier-des-charges.md`.
> Les arbitrages sont justifiés dans `docs/decisions.md`.

---

## 1. Vue d'ensemble

```
                                  ┌──────────────────────────────────────┐
      Navigateur (FR/EN)          │            Vercel Edge               │
  ┌──────────────────────┐        │  middleware : locale + session +     │
  │  App interne         │◄──────►│  résolution du tenant + garde portail│
  │  /[locale]/app/…     │        └───────────────┬──────────────────────┘
  ├──────────────────────┤                        │
  │  Portail client      │                        ▼
  │  /[locale]/portal/…  │        ┌──────────────────────────────────────┐
  ├──────────────────────┤        │      Next.js 15 · App Router         │
  │  Lien public partagé │        │  RSC (lecture)  +  Server Actions    │
  │  /share/[token]      │        │           (écriture)                 │
  └──────────────────────┘        │  ┌────────────────────────────────┐  │
                                  │  │  Couche d'accès (obligatoire)  │  │
                                  │  │  auth → tenant → permission →  │  │
                                  │  │  validation zod → service      │  │
                                  │  └───────────────┬────────────────┘  │
                                  └──────────────────┼───────────────────┘
                                                     │ 2 pools distincts
                          ┌──────────────────────────┼──────────────────────────┐
                          ▼                          ▼                          ▼
                 ┌─────────────────┐      ┌────────────────────┐     ┌──────────────────┐
                 │ rôle app_user   │      │  rôle app_portal   │     │ rôle app_migrator│
                 │ (interne)       │      │  (client externe)  │     │ (migrations)     │
                 └────────┬────────┘      └─────────┬──────────┘     └────────┬─────────┘
                          └───────────────┬─────────┘                         │
                                          ▼                                   ▼
                          ┌────────────────────────────────────────────────────────┐
                          │      PostgreSQL 16 — Row Level Security activée        │
                          │      organization_id sur chaque table applicative      │
                          └────────────────────────────────────────────────────────┘

   Workers (jobs)                Stockage objets            E-mail             Observabilité
 ┌───────────────────┐      ┌────────────────────┐   ┌───────────────┐   ┌──────────────────┐
 │ santé projet      │      │ Cloudflare R2 (S3) │   │ Resend        │   │ Sentry + logs    │
 │ notifications     │      │ URL signées        │   │ React Email   │   │ structurés       │
 │ rappels deadline  │      │ courte durée       │   │ FR/EN         │   │                  │
 │ pré-repo. vendredi│      └────────────────────┘   └───────────────┘   └──────────────────┘
 │ export PDF        │
 └───────────────────┘
```

---

## 2. Stack technique

### 2.1. Socle

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | **TypeScript 5.x**, `strict: true`, `noUncheckedIndexedAccess` | Contrainte « fortement typé » |
| Framework | **Next.js 15** (App Router, RSC, Server Actions) | Un seul déploiement pour app interne + portail + liens publics ; rendu serveur par défaut = moins de JS sur mobile |
| Runtime | Node.js 22 LTS | Compatible PDF, jobs, streams |
| Base de données | **PostgreSQL 16** | RLS native, JSONB, agrégats, full-text — le cœur du besoin |
| ORM | **Drizzle ORM** + `drizzle-kit` | Contrôle SQL complet (indispensable pour RLS et les agrégats analytiques), typage intégral, migrations SQL lisibles. Voir ADR-002 |
| Auth | **Better Auth** (auto-hébergé) | TypeScript-natif, sessions en base, plugin `organization`, invitations, 2FA optionnelle. Les données d'identité restent dans **notre** base. Voir ADR-003 |
| UI | **Tailwind CSS v4** + **shadcn/ui** (Radix) | Composants possédés (pas de dépendance de design), accessibles, thématisables via jetons CSS |
| i18n | **next-intl** | Routage par locale, messages typés, formats ICU (pluriels, dates, nombres, devises) |
| Formulaires | **React Hook Form** + **Zod** | Un seul schéma Zod partagé client/serveur |
| État serveur | RSC + **TanStack Query** (uniquement pour les vues interactives : kanban, calendrier, recherche) | Pas de store global |
| Graphiques | **Recharts** | Suffisant, léger, thématisable |
| Tableaux | **TanStack Table** | Tri/filtre/virtualisation pour les listes d'actions et de résultats |
| Jobs | **pg-boss** (files dans PostgreSQL) | Pas d'infrastructure supplémentaire ; transactionnel avec la donnée métier. Voir ADR-007 |
| Fichiers | **Stockage objet S3-compatible** derrière `StorageAdapter` (Scaleway Object Storage `fr-par` au MVP) | Endpoint et région configurables — aucune dépendance à un fournisseur (ADR-021) |
| PDF | **@react-pdf/renderer** dans un worker | Rendu déterministe, pas de navigateur headless en serverless |
| E-mail | **React Email** + `MailAdapter` (SMTP par défaut, Resend en option) | Le SMTP garantit la portabilité vers n'importe quel fournisseur UE (ADR-021) |
| Observabilité | **Sentry** + logs JSON structurés (pino) | |
| Analytics produit | PostHog (auto-hébergeable) | Mesure de l'adoption de la boucle de valeur |

### 2.2. Qualité et outillage

| Besoin | Outil |
|---|---|
| Lint / format | **Biome** (lint + format en un outil, rapide) |
| Tests unitaires & intégration | **Vitest** |
| Base de test jetable | **Testcontainers** (PostgreSQL) |
| E2E | **Playwright** (Chromium + WebKit mobile) |
| Accessibilité | `@axe-core/playwright` |
| Hooks Git | **Lefthook** |
| CI | **GitHub Actions** |
| Gestion de paquets | **pnpm** |
| Versionnage BDD | migrations SQL versionnées `drizzle-kit` |

### 2.3. Ce que l'on n'utilise pas, et pourquoi

- ❌ **tRPC / GraphQL** — les Server Actions + RSC couvrent 95 % des besoins avec un typage de bout en bout natif.
- ❌ **Redux / Zustand global** — l'état serveur est dans le serveur ; l'état local reste local.
- ❌ **Microservices** — un monolithe modulaire correctement découpé. Voir ADR-001.
- ❌ **Redis au MVP** — PostgreSQL suffit pour les files et le cache (`unstable_cache` de Next). À réévaluer sous charge.
- ❌ **Un ORM qui cache le SQL** — les dashboards et le module Results sont des requêtes analytiques.

---

## 3. Architecture applicative — monolithe modulaire

Trois couches, dans un seul déploiement :

```
┌─────────────────────────────────────────────────────────────┐
│ 1. INTERFACE  (src/app)                                     │
│    Routes, layouts, pages RSC, composants d'écran.          │
│    Ne contient JAMAIS de logique métier ni de SQL.          │
├─────────────────────────────────────────────────────────────┤
│ 2. MODULES    (src/modules/<domaine>)                       │
│    Un module par domaine métier. Chacun expose :            │
│      schemas.ts   – contrats Zod (entrée/sortie)            │
│      queries.ts   – lectures (appelées par les RSC)         │
│      mutations.ts – Server Actions (écritures)              │
│      service.ts   – règles métier pures, testables seules   │
│      policy.ts    – règles de permission du domaine         │
│      components/  – composants propres au domaine           │
├─────────────────────────────────────────────────────────────┤
│ 3. SOCLE      (src/db, src/lib, src/server)                 │
│    Schéma, RLS, contexte tenant, auth, i18n, erreurs,       │
│    stockage, e-mail, jobs.                                  │
└─────────────────────────────────────────────────────────────┘
```

**Règles de dépendance (vérifiées en CI)**

1. `app/` → `modules/` → `db|lib` . Jamais l'inverse.
2. Un module **ne peut pas** importer les fichiers internes d'un autre module ; il passe par son `index.ts`.
3. `db/` n'importe rien de `modules/`.
4. Aucun accès à `db` depuis `app/`.
5. `service.ts` est **pur** : pas d'I/O, pas de `db`, pas de `headers()`. C'est là que vivent le score de santé, le calcul d'écart, le barème XP, l'avancement.

### 3.1. Le portail d'accès obligatoire

Toute écriture passe par une seule fabrique. C'est le point qui rend la sécurité non contournable.

```ts
// src/server/action.ts  (forme cible, non implémenté à ce stade)
export const createAction = defineAction({
  input: createActionSchema,                 // 1. validation Zod
  permission: 'action.create',               // 2. permission requise
  scope: (input) => ({ projectId: input.projectId }), // 3. portée vérifiée
  handler: async (input, ctx) => { … },      // 4. ctx.db est DÉJÀ scopé au tenant
})
```

`defineAction` garantit dans cet ordre : session valide → organisation active résolue → rôle et portée vérifiés →
entrée validée → transaction ouverte avec `SET LOCAL app.organization_id` → handler → événement d'activité → audit → revalidation du cache.

**Il n'existe aucun autre chemin d'écriture.** Toute PR introduisant un accès direct à `db` depuis une route est refusée.

---

## 4. Architecture des dossiers

```
doomee/
├── CLAUDE.md                        # règles permanentes du projet
├── README.md
├── biome.json  lefthook.yml  tsconfig.json  next.config.ts  drizzle.config.ts
├── docs/
│   ├── cahier-des-charges.md
│   ├── architecture.md
│   ├── database.md
│   ├── roadmap.md
│   └── decisions.md
├── messages/
│   ├── fr.json                      # catalogue d'interface FR
│   └── en.json                      # catalogue d'interface EN
├── src/
│   ├── app/
│   │   ├── [locale]/
│   │   │   ├── (marketing)/         # landing publique
│   │   │   ├── (auth)/              # sign-in, sign-up, invite, reset
│   │   │   ├── (app)/               # ESPACE INTERNE — garde : membre de l'org
│   │   │   │   ├── layout.tsx       # shell, nav calculée depuis les permissions
│   │   │   │   ├── home/
│   │   │   │   ├── my-work/         # + focus mode
│   │   │   │   ├── projects/[projectId]/{overview,actions,objectives,deliverables,results,insights,risks,activity}/
│   │   │   │   ├── clients/[clientId]/
│   │   │   │   ├── results/
│   │   │   │   ├── insights/
│   │   │   │   ├── reports/[reportId]/
│   │   │   │   ├── calendar/
│   │   │   │   ├── team/
│   │   │   │   ├── meetings/
│   │   │   │   └── settings/{profile,organization,members,taxonomies,notifications}/
│   │   │   ├── (portal)/            # PORTAIL CLIENT — garde : rôle client
│   │   │   │   └── portal/{overview,projects,deliverables,results,reports,messages}/
│   │   │   ├── (admin)/             # SUPER ADMIN — garde : platform_admin
│   │   │   │   └── admin/{organizations,subscriptions,audit}/
│   │   │   └── share/[token]/       # rapport partagé, sans session
│   │   └── api/
│   │       ├── auth/[...all]/       # Better Auth
│   │       ├── files/{upload,download}/
│   │       ├── reports/[id]/export/
│   │       └── cron/[job]/          # déclencheurs planifiés (signés)
│   │
│   ├── modules/
│   │   ├── organizations/  members/  clients/  projects/  milestones/
│   │   ├── actions/  objectives/  results/  metrics/  deliverables/
│   │   ├── insights/  reports/  risks/  meetings/  calendar/
│   │   ├── health/          # score de santé + explication (service pur)
│   │   ├── gamification/    # XP, niveaux, badges, Wins
│   │   ├── notifications/   # in-app + e-mail
│   │   ├── activity/        # fil d'activité + audit
│   │   ├── comments/  files/  search/
│   │   └── taxonomies/      # types d'action, canaux, catégories, gabarits de résultats
│   │
│   ├── components/
│   │   ├── ui/              # shadcn/ui — primitives, non modifiées sans raison
│   │   ├── patterns/        # composants Doomee réutilisables :
│   │   │                    #  StatusBadge, PriorityChip, ProgressRing, HealthScore,
│   │   │                    #  EmptyState, PageHeader, DataTable, FilterBar,
│   │   │                    #  MetricTile, DeltaIndicator, Timeline, Avatar(Stack),
│   │   │                    #  ConfirmDialog, SheetForm, DateRangePicker, XpToast
│   │   └── layout/          # AppShell, PortalShell, Nav, CommandPalette
│   │
│   ├── db/
│   │   ├── schema/          # un fichier par domaine + index.ts
│   │   ├── migrations/      # SQL généré + migrations RLS écrites à la main
│   │   ├── policies/        # définitions RLS (source de vérité, testées)
│   │   ├── seed/            # taxonomies, métriques, gabarits, badges, niveaux
│   │   ├── client.ts        # pools : app_user / app_portal
│   │   └── tenant.ts        # withTenant(orgId, fn) → transaction + SET LOCAL
│   │
│   ├── lib/
│   │   ├── auth/            # config Better Auth, session, invitations
│   │   ├── permissions/     # matrice rôle→permission, can(), garde de portée
│   │   ├── i18n/            # routing, requestConfig, formatage, locale de rapport
│   │   ├── validation/      # helpers Zod partagés
│   │   ├── errors/          # AppError typées → messages localisés
│   │   ├── storage/         # R2, URL signées
│   │   ├── mail/            # Resend + React Email
│   │   ├── jobs/            # pg-boss : définitions et planification
│   │   └── utils/
│   │
│   ├── server/
│   │   ├── action.ts        # defineAction (le portail d'écriture)
│   │   ├── query.ts         # defineQuery (le portail de lecture)
│   │   └── context.ts       # requireSession, requireOrg, requirePortalUser
│   │
│   ├── emails/              # gabarits React Email, FR/EN
│   ├── reports/             # gabarits PDF react-pdf + composition des sections
│   └── styles/globals.css   # jetons de design Doomee
│
├── tests/
│   ├── unit/                # services purs
│   ├── integration/         # base réelle, dont la suite d'isolation tenant
│   ├── e2e/                 # Playwright : les 15 critères MVP, FR + EN
│   └── fixtures/            # fabriques de données
└── .github/workflows/ci.yml
```

**Convention de nommage** : dossiers et fichiers en `kebab-case`, composants React en `PascalCase`,
tout identifiant de code en **anglais**, toute documentation en **français**.

---

## 5. Modèle multi-tenant

### 5.1. Choix : base unique, schéma unique, RLS PostgreSQL

| Option | Verdict |
|---|---|
| Base par tenant | ❌ Migrations et coût ingérables dès quelques dizaines d'organisations |
| Schéma par tenant | ❌ Même problème à moindre échelle ; casse le pooling |
| **Table partagée + `organization_id` + RLS** | ✅ Retenu |

`organization_id uuid NOT NULL` est présent sur **toutes** les tables applicatives — y compris les tables filles,
même quand le parent le porte déjà. C'est une dénormalisation **volontaire** : elle permet à RLS de filtrer
sans jointure, et transforme toute erreur de rattachement en violation de contrainte plutôt qu'en fuite de données.

Chaque clé étrangère intra-tenant est déclarée **composite** :
```sql
FOREIGN KEY (organization_id, project_id) REFERENCES projects (organization_id, id)
```
→ il devient **impossible** de rattacher une action du tenant A à un projet du tenant B, même avec une requête fautive.

### 5.2. Les trois rôles PostgreSQL

| Rôle | Utilisé par | Ce que RLS autorise |
|---|---|---|
| `app_user` | Sessions internes (owner, direction, manager, collaborator) | Lignes de l'organisation courante uniquement |
| `app_portal` | **Sessions client** | Lignes de l'organisation courante **ET** rattachées à un client autorisé **ET** `is_client_visible = true` |
| `app_migrator` | Migrations, seed | `BYPASSRLS`, jamais utilisé par l'application |

Le portail client tourne sur un **pool de connexions distinct** avec un rôle distinct.
Cela signifie qu'une faille applicative dans le portail (oubli d'un filtre, injection de paramètre)
**ne peut pas** exposer une note interne : la base refuse de la renvoyer.

RLS filtre des **lignes**. Pour filtrer aussi les **colonnes**, le portail ne lit aucune table
directement : il lit des vues du schéma `portal` déclarées `security_invoker = true`, à liste de
colonnes explicite (ADR-026, `docs/database.md` §13.1). C'est ce qui rend `health_score`,
`budget_amount` ou `spent_minutes` structurellement inatteignables depuis un compte client.

```sql
-- Exemple : politique sur les actions
CREATE POLICY tenant_isolation ON actions FOR ALL TO app_user
  USING      (organization_id = current_setting('app.organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id')::uuid);

CREATE POLICY portal_read ON actions FOR SELECT TO app_portal
  USING (
    organization_id = current_setting('app.organization_id')::uuid
    AND is_client_visible
    AND project_id IN (
      SELECT p.id FROM projects p
      WHERE p.organization_id = current_setting('app.organization_id')::uuid
        AND p.client_id = ANY (string_to_array(current_setting('app.client_ids'), ',')::uuid[])
        AND p.is_client_visible
    )
  );
```

### 5.3. Propagation du contexte

```ts
// Toute requête applicative passe par là. Sans exception.
await withTenant({ organizationId, actor }, async (tx) => { … })
```
`withTenant` ouvre une transaction et exécute `SET LOCAL app.organization_id = …`
(et `app.client_ids` pour le portail). `SET LOCAL` est **transaction-scoped** : il ne fuit jamais
vers la connexion suivante du pool. C'est ce qui rend le motif compatible avec PgBouncer en mode transaction.

`withTenant` est la **seule** exportation qui donne accès à un client de base. Le client brut n'est jamais exporté.

### 5.4. Garanties vérifiées automatiquement

Une suite de tests dédiée, bloquante en CI :

1. Pour **chaque** table applicative : RLS activée **et** `FORCE ROW LEVEL SECURITY`.
2. Pour **chaque** table : un test d'isolation croisée (org A ne lit/écrit/supprime rien de l'org B) — généré depuis le schéma, donc impossible à oublier lors de l'ajout d'une table.
3. Pour **chaque** table exposée au portail : un test de fuite (`is_client_visible = false` → invisible ; client X ne voit pas le client Y).
4. Un test d'architecture : aucun fichier hors `src/db/tenant.ts` n'importe le client de base brut.

---

## 6. Authentification et autorisation

### 6.1. Authentification — Better Auth

- **E-mail + mot de passe** (Argon2id), vérification d'adresse obligatoire, réinitialisation par jeton court.
- **Lien magique** pour les contacts clients (moins de friction sur le portail).
- **OAuth Google** optionnel pour les membres internes.
- **2FA (TOTP)** disponible, exigible par l'organisation.
- Sessions **en base**, cookie `HttpOnly` + `Secure` + `SameSite=Lax`, rotation à l'élévation de privilège, révocation par appareil.
- Invitations : jeton à usage unique, expiration 7 jours, rôle et organisation pré-liés.

### 6.2. Résolution du tenant

L'organisation active est portée par la **session**, pas par l'URL (pas de sous-domaine au MVP).
Un utilisateur multi-organisations en change via un sélecteur, ce qui régénère la session.
L'URL reste `/[locale]/app/...` — l'`organization_id` n'est jamais un paramètre de requête manipulable.

### 6.3. Autorisation — trois barrières successives

```
┌─ 1. AUTHENTIFICATION ── session valide ? ─────────────────────────┐
│  ┌─ 2. AUTORISATION ── rôle + portée (application) ─────────────┐ │
│  │   can(actor, 'deliverable.approve', { deliverableId })       │ │
│  │   ├─ matrice rôle → permission (statique, typée, testée)     │ │
│  │   └─ portée : membre du projet ? client rattaché ?           │ │
│  │  ┌─ 3. ISOLATION ── RLS PostgreSQL (dernier rempart) ─────┐  │ │
│  │  │   Lignes : la base refuse, même si 1-2 sont buguées     │  │ │
│  │  │   Colonnes : vues `portal.*` security_invoker (ADR-026) │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

**Répartition des responsabilités**
- RLS garantit la **frontière d'organisation** et le **cloisonnement du portail**. Absolu, non contournable.
- La couche applicative garantit le **rôle** et la **portée fine** (membre de projet, propriétaire d'une action).
- L'interface **masque** ce qui n'est pas permis, mais ne sécurise rien. Elle utilise la même fonction `can()`.

**La matrice de permissions est une donnée typée**, pas des `if (role === 'manager')` dispersés :
```ts
// src/lib/permissions/matrix.ts
export const PERMISSIONS = {
  'project.create': ['owner', 'direction', 'manager'],
  'deliverable.approve': ['client'],
  'result.create': ['owner', 'manager', 'collaborator'],
  // …
} as const satisfies Record<Permission, readonly Role[]>
```
La matrice du §3.2 du cahier des charges est traduite en test table-driven : toute divergence casse la CI.

### 6.4. Liens de partage publics

Un rapport partagé est accessible sans session via `/share/[token]` :
jeton aléatoire 256 bits, **haché** en base (`report_shares.token_hash`), expiration obligatoire, révocable,
mot de passe optionnel, compteur de vues, `X-Robots-Tag: noindex`.
La page lit **uniquement le snapshot immuable** du rapport, jamais les tables vivantes.

---

## 7. Stratégie d'internationalisation FR/EN

### 7.1. Trois langues distinctes dans le produit

| Langue | Source | Portée |
|---|---|---|
| **Langue d'interface** | `users.locale` | Écrans, menus, boutons, statuts, formulaires, messages d'erreur |
| **Langue de notification** | `users.locale` | E-mails et notifications reçus par cet utilisateur |
| **Langue de reporting** | `users.report_locale` (défaut), surchargeable **par rapport** (`reports.locale`) | Titres de sections, libellés de statuts et de métriques, formats de nombres et dates dans le PDF |

Un manager francophone génère un rapport en anglais pour un client international — c'est un cas d'usage explicite du cahier des charges, pas une option.

### 7.2. Règles

1. **Aucune chaîne visible en dur.** Tout passe par `useTranslations` / `getTranslations`. Vérifié par une règle de lint.
2. **Clés de messages typées** — `messages/fr.json` est la source de vérité ; `en.json` doit avoir exactement les mêmes clés (test de parité en CI, échec si une clé manque).
3. **Les données métier ne sont pas des messages.** Les taxonomies (types d'action, canaux, catégories, types de livrables, types d'objectifs, métriques, badges) stockent leurs libellés en base :
   ```sql
   labels jsonb NOT NULL  -- { "fr": "Publication Social Media", "en": "Social Media Post" }
   ```
   → une organisation ajoute son propre type d'action sans toucher au code ni redéployer.
4. **Les énumérations d'état sont du code**, leurs libellés sont dans les catalogues : `status.action.in_review` → « En validation » / « In review ». Une machine à états n'est pas une donnée configurable.
5. **Le contenu utilisateur n'est pas traduit** au MVP (descriptions, commentaires, analyses). La langue de saisie est conservée telle quelle. La traduction assistée est un sujet V2.
6. **Formats** : dates, nombres, pourcentages et devises via l'API `Intl`, avec le fuseau et le format de date de l'utilisateur. Jamais de formatage manuel.
7. **Devises** : la devise est un attribut de la donnée (`budget_currency`, `metrics.unit`), pas de la locale. FCFA, EUR, USD coexistent.
8. **Routage** : `/fr/...` et `/en/...`, détection au premier accès (préférence utilisateur > cookie > `Accept-Language` > `fr`), sans redirection intempestive.
9. **E-mails** : rendus dans la langue du destinataire, résolue au moment de l'envoi du job, pas au moment du déclenchement.

---

## 8. Système de design

### 8.1. Jetons

```css
:root {
  --doomee-yellow: #FFD21F;  --doomee-black: #111111;
  --background: #FAFAF7;     --surface: #FFFFFF;    --border: #E8E8E3;
  --success: #22A06B;        --danger: #E5484D;     --warning: #F59E0B;
  --radius: 12px;
}
```
- Les couleurs ne sont **jamais** écrites en dur dans un composant ; on passe par les jetons Tailwind.
- **Règle du jaune** : un seul élément jaune dominant par écran (le CTA principal, ou la célébration).
- Contraste **AA minimum**. Attention : `#FFD21F` exige du texte `#111111`, jamais du blanc.
- Mode sombre : préparé au niveau des jetons, activé en V2.

### 8.2. Composants réutilisables (patterns)

Les écrans sont assemblés à partir d'un vocabulaire fixe : `PageHeader`, `DataTable`, `FilterBar`,
`StatusBadge`, `PriorityChip`, `ProgressRing`, `HealthScore`, `MetricTile`, `DeltaIndicator`,
`Timeline`, `EmptyState`, `SheetForm`, `ConfirmDialog`, `AvatarStack`, `XpToast`.

Règle : **si un motif visuel apparaît une troisième fois, il devient un composant.** Pas avant (pas d'abstraction prématurée).

### 8.3. Mobile-first

- Conception à 375 px d'abord, puis élargissement. Cibles tactiles ≥ 44 px.
- Navigation par barre inférieure sur mobile, latérale sur desktop.
- Les formulaires longs (résultats) sont **progressifs** : une section à la fois.
- Le portail client est prioritairement consulté sur mobile → il est optimisé pour ça.
- PWA installable (manifeste + service worker de cache applicatif). Pas de mode hors-ligne au MVP.

---

## 9. Performance

### 9.0. Volumétrie cible à 12 mois *(validée — ADR-022)*

| Entité | Volume | Conséquence de conception |
|---|---|---|
| Organisations | ~100 | Table partagée + RLS parfaitement dimensionnée (ADR-004) |
| Projets | ~1 000 | ~10 projets par organisation — les listes tiennent en une page |
| Actions | ~100 000 | ~100 par projet — index `(organization_id, …)` suffisants, pas de partitionnement |
| Résultats + `result_metrics` | ~300 000 – 1 M | La vue matérialisée `result_metrics_daily` devient utile dès ~200 k lignes |
| `activity_events` | ~1 M | Table la plus volumineuse — **partitionnement par mois prévu mais pas activé au MVP** |
| Fichiers | ~100 Go | Stockage objet, jamais en base |

Ces volumes tiennent **très largement** sur une instance PostgreSQL unique (4 vCPU / 16 Go).
Les points de bascule sont identifiés à l'avance pour qu'aucun ne demande de refonte :

| Seuil | Déclencheur | Action, sans refonte |
|---|---|---|
| `activity_events` > 5 M | volume | Partitionnement déclaratif par mois (`PARTITION BY RANGE (created_at)`) |
| `result_metrics` > 5 M | volume | Partitionnement par année + agrégats pré-calculés |
| > 500 organisations | croissance | Réplique en lecture pour les dashboards et le reporting |
| > 50 jobs/s | usage | Migration de pg-boss vers BullMQ + Redis (ADR-007) |
| Une organisation « géante » | client grand compte | Extraction de son schéma vers une base dédiée — **possible car `organization_id` est déjà partout** |

> Aucune de ces évolutions ne touche le modèle de données ni la couche d'accès : c'est le sens
> de la contrainte « `organization_id` sur toutes les tables, index toujours préfixés par lui ».

### 9.1. Règles permanentes

| Sujet | Mesure |
|---|---|
| Dashboards | Requêtes agrégées écrites à la main, un aller-retour par bloc. Aucun N+1 toléré |
| Santé projet | Calculée par job et **stockée** (`projects.health_score`), jamais à la volée dans une liste |
| Avancement projet | Stocké et recalculé à l'événement (compteurs dénormalisés `actions_total` / `actions_done` / `actions_overdue`) |
| Résultats consolidés | Vue matérialisée `result_metrics_daily`, rafraîchie par job, pour les filtres période/client/canal |
| Listes | Pagination par curseur (`created_at`,`id`), jamais `OFFSET` sur les grandes tables |
| Cache | `unstable_cache` + `revalidateTag` par entité et par organisation (`org:<id>:project:<id>`) |
| Index | Systématiquement `(organization_id, …)` en tête — RLS filtre d'abord là-dessus |
| Budget | LCP < 2,5 s sur 4G mobile ; JS initial < 200 ko gzip sur le portail client |

---

## 10. Stratégie de tests

### 10.1. Pyramide

```
        ╱ E2E Playwright ╲          ~25 scénarios — les 15 critères MVP, FR + EN
       ╱──────────────────╲
      ╱  Intégration (BDD) ╲        ~200 tests — RLS, permissions, actions serveur
     ╱──────────────────────╲
    ╱   Unitaires (services) ╲      ~400 tests — santé, écarts, XP, avancement, métriques
   ╱──────────────────────────╲
```

### 10.2. Par niveau

**Unitaires (Vitest, sans I/O)** — sur `service.ts`, qui est pur :
score de santé et ses facteurs · calcul d'écart objectif/résultat · métriques dérivées (CTR, CPL, ROAS, ROI) ·
avancement projet · barème XP et niveaux · transitions d'état livrable/action · résolution de locale ·
rendu des explications de santé en FR et EN.
→ **Couverture exigée : 90 % sur `src/modules/*/service.ts`.** Bloquant.

**Intégration (Vitest + Testcontainers PostgreSQL)** — base réelle, migrations réelles, RLS réelle :
- 🔒 **Suite d'isolation tenant** (générée depuis le schéma) : pour chaque table, org A ne peut ni lire, ni écrire, ni modifier, ni supprimer les données de org B.
- 🔒 **Suite de fuite portail** : pour chaque table exposée, un client ne voit ni l'interne, ni les autres clients, ni le non-`is_client_visible`.
- 🔒 **Matrice de permissions** : test table-driven dérivé de `PERMISSIONS`, confronté au tableau §3.2 du cahier des charges.
- Chaque Server Action : cas nominal, entrée invalide, permission refusée, mauvais tenant.
- Contraintes d'intégrité : clés composites, machines à états, unicités.

**E2E (Playwright)** — un scénario par critère de réussite MVP, plus :
- le flux complet `Action → Résultat → Insight → Prochaine action` ;
- le cycle livrable avec validation **côté client** (deux navigateurs, deux rôles) ;
- la génération d'un rapport **en anglais depuis une interface en français** ;
- un test d'étanchéité : un client authentifié tente d'atteindre une URL interne → 404, pas 403 (on ne confirme pas l'existence) ;
- exécution mobile (Pixel 5 / iPhone 13) sur les parcours collaborateur et client ;
- `axe` sur les 10 écrans principaux, aucune violation critique.

### 10.3. Règles

- **Aucune donnée de test partagée entre tests.** Une organisation par test, créée par fabrique.
- **Aucun mock de la base.** On teste contre PostgreSQL, sinon on ne teste pas RLS.
- On ne mocke que le **hors-périmètre** : envoi d'e-mail, stockage objet, horloge.
- Tout correctif de bug commence par un test qui échoue.
- **Une PR qui touche au schéma sans toucher aux tests d'isolation est refusée.**

### 10.4. Pipeline CI

```
typecheck → biome → tests unitaires → migrations + tests d'intégration → build → E2E → audit deps
```
Toutes les étapes sont bloquantes sur `main`.

---

## 11. Risques techniques

| # | Risque | Impact | Prob. | Mitigation |
|---|---|---|---|---|
| **R1** | **Fuite inter-organisations** — une requête oublie le filtre tenant | 🔴 Critique · fatal commercialement | Moyenne | RLS + `FORCE RLS` + clés composites + `withTenant` comme seul accès + suite d'isolation générée + rôles PG séparés. **Quatre barrières indépendantes** |
| **R2** | **Fuite vers le portail client** — une note interne apparaît côté client | 🔴 Critique | Moyenne-haute | Rôle PostgreSQL `app_portal` avec politiques restrictives, `is_client_visible` par défaut à `false`, layout portail séparé, suite de tests de fuite, revue obligatoire de toute PR touchant `(portal)` |
| **R3** | **`SET LOCAL` + pooling** — contexte tenant fuité entre requêtes | 🔴 Critique | Faible | `SET LOCAL` uniquement (transaction-scoped), pooling en mode transaction, test de fuite de contexte sous concurrence, jamais de `SET` global |
| **R4** | **Sur-généralisation du modèle de métriques** — un EAV illisible et lent | 🟠 Élevé | Haute | Métriques normalisées dans `result_metrics` (typées, indexées), catalogue `metrics` fermé et versionné, formulaires pilotés par gabarits mais **valeurs stockées en colonnes typées**, pas en JSONB libre |
| **R5** | **Performance des dashboards** — agrégations sur toute l'organisation | 🟠 Élevé | Haute | Compteurs dénormalisés, santé et avancement stockés, vue matérialisée pour les résultats, index `(organization_id, …)`, budget de requêtes mesuré en CI |
| **R6** | **Génération PDF en serverless** — mémoire, cold start, polices | 🟠 Élevé | Moyenne | `@react-pdf/renderer` (pas de navigateur headless), exécution en job asynchrone avec notification, polices embarquées, rendu depuis le snapshot immuable |
| **R7** | **Complexité du reporting pré-alimenté** — sous-estimée | 🟠 Élevé | Haute | Chaque section est un « fournisseur de données » indépendant et testé isolément ; une section qui échoue se dégrade en section vide éditable, elle ne casse pas le rapport |
| **R8** | **Relations polymorphes** (commentaires, pièces jointes, activité) sans intégrité référentielle | 🟡 Moyen | Moyenne | `entity_type` en enum PostgreSQL + contrainte de cohérence + job de détection d'orphelins + suppressions passant toujours par le service |
| **R9** | **Fuseaux horaires** — « en retard » faux d'un jour | 🟡 Moyen | Haute | Tout en `timestamptz` UTC en base ; les dates d'échéance sont des `date` + fuseau du projet ; le calcul « en retard » est un service pur testé sur plusieurs fuseaux |
| **R10** | **Dérive FR/EN** — clés manquantes en production | 🟡 Moyen | Haute | Test de parité des catalogues bloquant, clés typées, lint interdisant les chaînes littérales dans le JSX |
| **R11** | **Maturité de Better Auth** | 🟡 Moyen | Moyenne | Auth isolée derrière `src/lib/auth` ; les sessions sont dans notre base ; version épinglée ; plan de repli documenté vers Auth.js (ADR-003) |
| **R12** | **Fiabilité des jobs** (pg-boss) — rapports du vendredi non préparés | 🟡 Moyen | Moyenne | Jobs idempotents avec clé d'unicité, retry exponentiel, file de rejets, alerte Sentry, page d'état des jobs pour le Super Admin |
| **R13** | **URL de fichiers devinables** | 🟠 Élevé | Faible | Clés de stockage opaques, aucun accès public, URL pré-signées ≤ 5 min générées après vérification de permission |
| **R14** | **Recherche globale lente** | 🟡 Moyen | Moyenne | `tsvector` généré par table + index GIN, `UNION ALL` borné, recherche filtrée par organisation avant tout |
| **R15** | **Sur-ingénierie** — le vrai risque de ce cahier des charges | 🟠 Élevé | Haute | Ordre de développement strict (`docs/roadmap.md`), une fonctionnalité ne démarre pas si la précédente n'est pas « définition de terminé » |
| **R16** | **Score de santé perçu comme arbitraire** | 🟡 Moyen | Moyenne | Facteurs et pondérations stockés en configuration d'organisation, explication systématique et lisible, historique consultable |

---

## 12. Sécurité — mesures transverses

- **Chiffrement** : TLS partout, chiffrement au repos par l'hébergeur, secrets dans le gestionnaire de la plateforme (jamais dans le dépôt).
- **En-têtes** : CSP stricte sans `unsafe-inline`, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`.
- **Limitation de débit** : connexion, invitation, réinitialisation, upload, liens partagés (par IP et par compte).
- **Téléversements** : type MIME vérifié côté serveur (pas via l'extension), taille plafonnée, analyse antivirus en V2, fichiers servis en `Content-Disposition: attachment` depuis un domaine distinct.
- **Audit** : toute action sensible (permission, partage, export, accès support, suppression) écrite dans `audit_logs`, table en insertion seule.
- **RGPD** : export et suppression des données d'une organisation, durées de conservation, sous-traitants documentés.
- **Suppression** : suppression logique (`deleted_at`) pour les entités métier, purge différée par job.
- **Dépendances** : `pnpm audit` en CI, Dependabot, versions épinglées.

---

## 13. Déploiement et environnements

### 13.1. Résidence des données — **Union Européenne** *(validé — ADR-021)*

Toutes les données (base, fichiers, sauvegardes, logs, e-mails sortants) résident dans l'Union Européenne.
**Mais l'architecture ne doit dépendre d'aucun fournisseur ni d'aucune région.** Une bascule vers
l'Afrique de l'Ouest (ou toute autre région) doit être une opération d'exploitation, pas une refonte.

### 13.2. Ce qui garantit la portabilité

| Brique | Règle de portabilité | Conséquence concrète |
|---|---|---|
| **Application** | Next.js en mode `standalone`, livré en **image Docker** | Tourne sur Vercel, Scaleway, OVH, Clever Cloud, Fly.io, Hetzner, ou un Kubernetes — sans changer une ligne |
| **Base** | **PostgreSQL 16 standard**. Aucune extension propriétaire, aucun helper de fournisseur (pas de `auth.uid()` à la Supabase), uniquement `current_setting()` | Un `pg_dump` / `pg_restore` suffit à déménager |
| **Fichiers** | Interface `StorageAdapter` ; implémentation S3 générique (`@aws-sdk/client-s3`) avec **endpoint et région configurables** | Scaleway, OVH, Cloudflare R2, MinIO auto-hébergé — même code |
| **E-mail** | Interface `MailAdapter` ; **SMTP par défaut**, Resend en implémentation alternative | Tout fournisseur d'envoi, y compris un relais local |
| **Jobs** | pg-boss, dans la même base | Suit la base, rien à migrer |
| **Auth** | Better Auth, sessions dans **notre** base | Aucune identité chez un tiers (ADR-003) |
| **Runtime** | **Node.js uniquement**, jamais l'Edge Runtime ; middleware minimal | Pas de dépendance à l'infrastructure de périphérie d'un hébergeur |
| **Secrets** | Variables d'environnement validées par Zod au démarrage | Pas de gestionnaire de secrets propriétaire |
| **Observabilité** | Sentry (région UE) + logs JSON sur la sortie standard | Les logs sont récupérables par n'importe quel collecteur |

**Règle inscrite dans `CLAUDE.md`** : aucun SDK spécifique à un hébergeur n'entre dans `src/modules/`.
Les seuls points de contact avec l'infrastructure sont `src/lib/storage` et `src/lib/mail`, tous deux
derrière une interface, tous deux avec au moins deux implémentations testées.

### 13.3. Environnements

| Env | Usage | Base | Fichiers |
|---|---|---|---|
| `local` | Développement | PostgreSQL 16 en Docker + seed de démo | MinIO en Docker |
| `ci` | Tests | Testcontainers (jetable) | MinIO en conteneur |
| `staging` | Recette, données anonymisées | Instance UE dédiée | Bucket UE dédié |
| `production` | — | Instance UE dédiée, PITR, chiffrement au repos | Bucket UE, versionné |

**Proposition d'hébergement MVP (UE, faiblement couplé)** : application en conteneur (Scaleway Serverless
Containers `fr-par` ou Vercel région `cdg1`) · PostgreSQL managé UE · Object Storage S3 `fr-par` ·
worker de jobs sur un conteneur Node dédié (jamais en serverless : PDF et recalculs sont longs).

> Le choix exact de l'hébergeur est **réversible par construction** et peut être arrêté au dernier moment,
> juste avant le LOT 15. Aucun lot antérieur n'en dépend.
