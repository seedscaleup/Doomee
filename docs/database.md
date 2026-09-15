# Doomee — Schéma de base de données

> **SGBD** : PostgreSQL 16 · **ORM** : Drizzle · **Isolation** : Row Level Security
> **Statut** : proposition en attente de validation

---

## 1. Conventions

| Règle | Détail |
|---|---|
| Identifiants | `uuid v7` généré applicativement (triable dans le temps, pas de fuite de cardinalité) |
| Nommage | `snake_case`, tables au **pluriel**, colonnes au **singulier** |
| Horodatage | `created_at` / `updated_at` en `timestamptz` (UTC) sur toutes les tables |
| Suppression | `deleted_at timestamptz` (suppression logique) sur les entités métier ; purge par job |
| Traçabilité | `created_by` / `updated_by` → `users(id)` sur les entités métier |
| **Tenant** | `organization_id uuid NOT NULL` sur **toutes** les tables applicatives, même redondant |
| **FK intra-tenant** | **Composites** : `(organization_id, parent_id) → parents(organization_id, id)` |
| Index | Toujours préfixés par `organization_id` |
| Argent | `numeric(18,2)` + colonne `currency char(3)` obligatoire. Jamais de `float` |
| **Agrégats monétaires** | **Ne jamais sommer deux devises.** Tout agrégat monétaire est `GROUP BY currency` (ADR-024) |
| Métriques | `numeric(20,4)` (supporte ratios, pourcentages et gros volumes) |
| Libellés métier | `labels jsonb` → `{ "fr": "…", "en": "…" }` |
| Enums d'état | Types `enum` PostgreSQL (machine à états = code) |
| Taxonomies | Tables de référence (données = configurable, jamais codées en dur) |
| Visibilité client | `is_client_visible boolean NOT NULL DEFAULT false` — **opt-in, jamais opt-out** |

**Distinction structurante** — *enum* vs *taxonomie* :
- Un **enum** décrit une machine à états gérée par du code (`action_status`, `deliverable_status`). Non modifiable par l'utilisateur.
- Une **taxonomie** est une donnée de classification (type d'action, canal, catégorie, type de livrable, type d'objectif, métrique). Livrée en seed, extensible par organisation, sans déploiement.

---

## 2. Cartographie des domaines

```
┌─ TENANCY ────────────┐  ┌─ RÉFÉRENTIEL ──────────────┐  ┌─ COLLABORATION ─────┐
│ organizations        │  │ action_types               │  │ comments            │
│ users                │  │ action_categories          │  │ comment_mentions    │
│ memberships          │  │ channels                   │  │ files               │
│ invitations          │  │ deliverable_types          │  │ attachments         │
│ sessions / accounts  │  │ objective_types            │  └─────────────────────┘
│ subscriptions        │  │ metrics                    │
│ client_user_access   │  │ result_form_templates      │  ┌─ PILOTAGE ──────────┐
└──────────────────────┘  │ result_form_fields         │  │ project_health_     │
                          │ xp_rules / levels / badges │  │   snapshots         │
┌─ CŒUR MÉTIER ────────┐  └────────────────────────────┘  │ risks               │
│ clients              │                                  │ meetings            │
│ client_contacts      │  ┌─ LA BOUCLE DE VALEUR ──────┐   │ meeting_participants│
│ projects             │  │ objectives                 │   │ meeting_decisions   │
│ project_members      │  │ actions                    │   │ milestones          │
└──────────────────────┘  │ action_collaborators       │   └─────────────────────┘
                          │ deliverables               │
┌─ RESTITUTION ────────┐  │ deliverable_versions       │   ┌─ SYSTÈME ───────────┐
│ reports              │  │ deliverable_reviews        │   │ notifications       │
│ report_sections      │  │ results                    │   │ notification_prefs  │
│ report_shares        │  │ result_metrics             │   │ activity_events     │
│ report_exports       │  │ result_notes               │   │ audit_logs          │
└──────────────────────┘  │ insights                   │   │ xp_events           │
                          │ insight_results            │   │ user_badges         │
                          │ insight_actions            │   │ jobs (pg-boss)      │
                          └────────────────────────────┘   └─────────────────────┘
```

---

## 3. Types énumérés

```sql
CREATE TYPE org_role         AS ENUM ('owner','direction','manager','collaborator','client');
CREATE TYPE member_status    AS ENUM ('invited','active','suspended');
CREATE TYPE locale_code      AS ENUM ('fr','en');

CREATE TYPE client_status    AS ENUM ('prospect','active','paused','archived');

CREATE TYPE project_status   AS ENUM ('to_start','in_progress','in_review','paused','blocked','done','archived');
CREATE TYPE priority_level   AS ENUM ('low','normal','high','urgent');
CREATE TYPE health_status    AS ENUM ('healthy','at_risk','blocked');
CREATE TYPE milestone_status AS ENUM ('upcoming','reached','missed');
CREATE TYPE project_member_role AS ENUM ('lead','member','reviewer');

CREATE TYPE action_status    AS ENUM ('todo','in_progress','in_review','done','blocked','cancelled');

CREATE TYPE objective_status AS ENUM ('draft','active','achieved','missed','cancelled');

CREATE TYPE deliverable_status AS ENUM
  ('draft','production','internal_review','client_review','changes_requested','approved','published');
CREATE TYPE review_decision  AS ENUM ('approved','changes_requested');
CREATE TYPE review_scope     AS ENUM ('internal','client');

CREATE TYPE result_note_kind AS ENUM
  ('observation','audience_feedback','client_feedback','difficulty','positive','negative','learning','opportunity');

CREATE TYPE risk_kind        AS ENUM ('risk','issue');
CREATE TYPE risk_level       AS ENUM ('low','medium','critical');
CREATE TYPE risk_status      AS ENUM ('open','mitigating','closed','accepted');

CREATE TYPE report_type      AS ENUM
  ('weekly_internal','monthly','project','client','campaign_review','period_review');
CREATE TYPE report_status    AS ENUM ('draft','in_review','published','archived');
CREATE TYPE report_section_key AS ENUM
  ('executive_summary','objectives','actions','deliverables','results',
   'objectives_comparison','analysis','insights','attention_points','recommendations','next_steps');
CREATE TYPE export_format    AS ENUM ('pdf','xlsx','csv');

CREATE TYPE visibility       AS ENUM ('internal','shared');
CREATE TYPE entity_type      AS ENUM
  ('client','project','action','objective','deliverable','result','insight','report','risk','meeting','milestone');

CREATE TYPE metric_kind      AS ENUM ('integer','decimal','currency','percent','ratio','duration');
CREATE TYPE metric_agg       AS ENUM ('sum','avg','last','max','min');
CREATE TYPE metric_direction AS ENUM ('higher_is_better','lower_is_better','neutral');
CREATE TYPE field_kind       AS ENUM ('number','percent','currency','text','longtext','url','date','select','boolean');
```

---

## 4. Domaine — Tenancy et identité

### `organizations`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `slug` | citext UNIQUE NOT NULL | |
| `logo_file_id` | uuid NULL | |
| `default_locale` | locale_code NOT NULL DEFAULT `'fr'` | |
| `timezone` | text NOT NULL DEFAULT `'UTC'` | IANA |
| `default_currency` | char(3) NOT NULL DEFAULT `'XOF'` | |
| `settings` | jsonb NOT NULL DEFAULT `'{}'` | pondérations santé, gamification on/off, seuils d'alerte — validé par un schéma Zod |
| `status` | text NOT NULL DEFAULT `'active'` | `active` / `suspended` |
| `created_at` `updated_at` `deleted_at` | timestamptz | |

### `users`
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `email` | citext UNIQUE NOT NULL | |
| `email_verified_at` | timestamptz NULL | |
| `name` | text NOT NULL | |
| `avatar_file_id` | uuid NULL | |
| `locale` | locale_code NOT NULL DEFAULT `'fr'` | **langue d'interface** |
| `report_locale` | locale_code NOT NULL DEFAULT `'fr'` | **langue de reporting par défaut, indépendante** |
| `timezone` | text NOT NULL DEFAULT `'UTC'` | |
| `date_format` | text NOT NULL DEFAULT `'dd/MM/yyyy'` | |
| `is_platform_admin` | boolean NOT NULL DEFAULT false | Super Admin — **hors organisation** |
| `last_seen_at` | timestamptz NULL | |

> `users` est **global**, pas tenant : une même personne peut appartenir à plusieurs organisations.
> C'est la seule table applicative sans `organization_id`, avec `sessions`, `accounts` et `audit_logs`.
>
> ⚠️ **Mais elle porte une politique RLS de visibilité** (ADR-028) : `app_user` ne lit une ligne que
> s'il existe une adhésion partagée dans l'organisation courante, et ne peut jamais l'écrire.
> Sans cela, une organisation pourrait énumérer les utilisateurs de toutes les autres.

### `memberships`
`id` · `organization_id` FK · `user_id` FK · `role org_role` · `status member_status` ·
`job_title text` · `invited_by` · `joined_at` · `deactivated_at`
**UNIQUE (organization_id, user_id)** · **UNIQUE (organization_id, id)** *(cible des FK composites)*

### `client_user_access` — contacts clients multi-comptes *(validé — ADR-023)*
Rattache un utilisateur de rôle `client` aux comptes clients qu'il peut voir.
`id` · `organization_id` · `user_id` · `client_id` · `granted_by` · `created_at`
**UNIQUE (organization_id, user_id, client_id)**
→ alimente `app.client_ids` dans le contexte RLS du portail.

**Un même contact peut couvrir plusieurs comptes clients ET plusieurs organisations** — cas des groupes et holdings :

```
users (1 personne, 1 e-mail)
  ├─ memberships (org A, role='client')  ─┬─ client_user_access → client « Filiale 1 »
  │                                       └─ client_user_access → client « Filiale 2 »
  └─ memberships (org B, role='client')  ─── client_user_access → client « Groupe X »
```

| Règle | Détail |
|---|---|
| Une personne = **une** ligne `users` | Un seul compte, un seul mot de passe, une seule préférence de langue |
| Un rôle **par organisation** | `memberships` porte le rôle ; la même personne peut être `client` chez A et `collaborator` chez B |
| Plusieurs clients **dans** une organisation | Plusieurs lignes `client_user_access` → `app.client_ids` est une **liste** |
| Changement d'organisation | Sélecteur d'organisation dans le portail, comme côté interne ; la session régénère `app.organization_id` **et** `app.client_ids` |
| Aucune fuite entre comptes | `app.client_ids` ne contient **que** les clients de l'organisation active. Testé : un contact des orgs A et B ne voit jamais A depuis B |

### `invitations`
`id` · `organization_id` · `email` · `role` · `client_id` (si rôle `client`) · `token_hash` ·
`expires_at` · `invited_by` · `accepted_at` · `revoked_at`

### `subscriptions` *(géré par le Super Admin au MVP)*
`id` · `organization_id` · `plan` · `status` · `seats_limit` · `current_period_start/end` · `notes`

### Tables Better Auth
`sessions` (`id`, `user_id`, `token_hash`, `active_organization_id`, `expires_at`, `ip`, `user_agent`),
`accounts` (OAuth), `verifications`, `two_factors`. Schéma géré par la bibliothèque, non modifié.

---

## 5. Domaine — Référentiel (taxonomies)

**Forme commune** — toutes ces tables partagent la même structure :

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid **NULL** | `NULL` = référentiel système, partagé et non modifiable |
| `code` | text NOT NULL | stable, utilisé par le code (`social_post`, `ads_campaign`) |
| `labels` | jsonb NOT NULL | `{ "fr": "…", "en": "…" }` |
| `color` `icon` | text NULL | |
| `sort_order` | int NOT NULL DEFAULT 0 | |
| `is_active` | boolean NOT NULL DEFAULT true | |

**UNIQUE (COALESCE(organization_id,'0…0'), code)**

Tables concernées : `action_types`, `action_categories`, `channels`, `deliverable_types`, `objective_types`.

### `metrics` — catalogue de métriques
Forme commune, plus :
`unit text` · `kind metric_kind` · `aggregation metric_agg` · `direction metric_direction` ·
`decimals int` · `is_computed boolean` · `formula text NULL`

Seed système (extrait) : `impressions`, `reach`, `views`, `reactions`, `comments`, `shares`, `clicks`,
`ctr` *(calculé : clicks/impressions)*, `leads`, `meetings`, `sales`, `revenue`, `conversion_rate`,
`spend`, `cpl` *(spend/leads)*, `cpc` *(spend/clicks)*, `roi`, `roas` *(revenue/spend)*, `traffic`,
`pages_delivered`, `features_delivered`, `bugs`, `tests_passed`, `performance_score`.

Les métriques calculées sont dérivées **à la lecture** par le service `metrics`, jamais stockées en double.

### `result_form_templates` — formulaires intelligents
`id` · `organization_id` NULL · `action_type_id` FK NULL · `code` · `labels` · `version int` · `is_active`
**UNIQUE (organization_id, action_type_id, version)**

### `result_form_fields`
`id` · `organization_id` NULL · `template_id` FK · `key text` · `kind field_kind` · `labels jsonb` ·
`help jsonb NULL` · `metric_id` FK NULL · `unit` · `is_required` · `sort_order` · `options jsonb NULL` ·
`default_value` · `min` · `max`
**UNIQUE (template_id, key)**

> C'est ce couple de tables qui réalise l'exigence « l'utilisateur ne doit pas avoir à renseigner des champs inutiles ».
> Seed livré : *Social Media Post*, *Ads Campaign*, *Website Build*, *Event*, *Content Production*, *Generic*.
> **Aucun formulaire de résultat n'est codé en dur.**

### Gamification (référentiel)
- `xp_rules` : `organization_id` NULL · `code` (`action_completed`, `deadline_respected`, `result_reported`, `project_completed`) · `points int` · `is_active`
- `levels` : `level int` · `min_xp int` · `labels jsonb`
- `badges` : `code` · `labels` · `icon` · `criteria jsonb`

---

## 6. Domaine — Cœur métier

### `industries` — secteurs d'activité *(table de référence, ADR-010)*
`id` · `organization_id` **NULL = entrée système** · `code` · `labels jsonb {fr,en}` ·
`sort_order` · `is_active`
**UNIQUE (coalesce(organization_id, uuid zéro), code)**

> Le secteur d'un client est une **classification**, donc une table, pas un enum et pas une chaîne
> libre (règle 7). Les entrées système sont posées par `pnpm db:seed` et lisibles par toutes les
> organisations ; une organisation peut ajouter les siennes sans déploiement. Les libellés sont
> **dans la ligne**, jamais dans les catalogues i18n : c'est de la donnée.
>
> RLS : `organization_id IS NULL OR organization_id = <org courante>` en lecture ; en écriture,
> l'organisation courante seulement — personne ne modifie une entrée système depuis l'application.

### `clients`
`id` · `organization_id` · `name` · `slug` · `logo_file_id` · `industry_id` FK NULL → `industries` ·
`description text` · `website` · `email` · `phone` · `address` · `status client_status` ·
`owner_user_id` *(responsable interne)* · `account_team_note text` · `created_by` `updated_by` ·
`created_at` `updated_at` `deleted_at`
**UNIQUE (organization_id, slug)** · **UNIQUE (organization_id, id)**

> `slug` est dérivé du nom et unique par organisation ; la création réessaie avec un suffixe plutôt
> que d'imposer le champ à l'utilisateur (règle 10, *less typing*).

### `client_contacts`
`id` · `organization_id` · `client_id` · `name` · `email` · `phone` · `job_title` ·
`is_primary boolean` *(le « responsable côté client »)* · `user_id` FK NULL *(si invité au portail)*
**FK composite (organization_id, client_id)** · **UNIQUE (organization_id, client_id, email)**

> `invitations.client_id` porte la portée d'une invitation de contact : accepter
> crée un `membership` de rôle `client` par organisation et une ligne
> `client_user_access` **par compte client**, jamais l'inverse (ADR-035).

> ⚠️ L'unicité porte sur **(client, e-mail)**, jamais sur l'e-mail seul : la même personne est un contact
> légitime de plusieurs clients (ADR-023). `user_id` pointe vers le **même** enregistrement `users` dans tous les cas.

### `projects`
| Colonne | Type | Notes |
|---|---|---|
| `id` `organization_id` | uuid | |
| `client_id` | uuid NULL | un projet interne peut ne pas avoir de client |
| `name` `code` `description` | text | |
| `status` | project_status NOT NULL DEFAULT `'to_start'` | |
| `priority` | priority_level NOT NULL DEFAULT `'normal'` | |
| `color` | text | identité visuelle |
| `start_date` `end_date` | date | |
| `timezone` | text NOT NULL | **attribut du projet** (ADR-039), renseigné à la création, sert au calcul « en retard » |
| `owner_user_id` | uuid | responsable |
| `budget_amount` | numeric(18,2) NULL | |
| `budget_currency` | char(3) NULL | |
| `is_client_visible` | boolean NOT NULL DEFAULT true | |
| `progress_percent` | int NOT NULL DEFAULT 0 | **dénormalisé** |
| `actions_total` `actions_done` `actions_overdue` | int DEFAULT 0 | **dénormalisés**, maintenus par le service |
| `deliverables_pending_client` | int DEFAULT 0 | **dénormalisé** |
| `open_risks_count` | int DEFAULT 0 | **dénormalisé** |
| `health_score` | int NULL | 0–100 |
| `health_status` | health_status NULL | |
| `health_computed_at` | timestamptz NULL | |
| `archived_at` `deleted_at` | timestamptz | |

**FK composite (organization_id, client_id)** · **UNIQUE (organization_id, id)**

> Les compteurs sont dénormalisés **volontairement** : les listes de projets et les dashboards en dépendent.
> Ils sont recalculés dans la même transaction que la mutation qui les affecte, et réconciliés par un job nocturne.
> `progress_percent` est écrit par `refreshProjectProgress`, à l'intérieur de la transaction appelante —
> vérifié par un test qui provoque un rollback et constate que le compteur et les lignes reviennent ensemble.
> Les compteurs d'actions restent à zéro jusqu'au LOT 5 ; l'arithmétique qui les combine vit déjà dans le
> service pur, donc ce lot ajoutera des lignes, pas des règles.

### `project_members`
`id` · `organization_id` · `project_id` · `user_id` · `role project_member_role` *(`lead` / `member` / `reviewer`)* ·
`added_by` · `added_at`
**FK composite (organization_id, project_id)** · **UNIQUE (organization_id, project_id, user_id)**

> **La table qui définit la portée d'un collaborateur** (ADR-038). Le rôle sur un projet est un
> **enum** et non du texte libre : c'est un ensemble fixé dans le code, comme `org_role`.
> Ce qu'on fait **sur** un projet n'est pas ce qu'on a le droit de faire **dans** l'organisation —
> un manager peut être simple membre d'un projet qu'il ne pilote pas.
>
> Le responsable d'un projet y est inscrit d'office à la création : rendre ça implicite, c'est
> obtenir un pilote qui ne peut plus ouvrir son propre projet le jour où il cesse d'être manager.

### `milestones` *(jalons)*
`id` · `organization_id` · `project_id` · `title` · `description` · `due_date date` ·
`status milestone_status` · `is_client_visible` *(défaut `false`)* · `reached_at` · `created_by` ·
`created_at` `updated_at` `deleted_at`
**FK composite (organization_id, project_id)**

> Le statut affiché est **dérivé** (ADR-039) : `reached` est un fait enregistré, `missed` est le verdict
> de l'horloge dans le fuseau du projet. La colonne existe pour les requêtes et les rapports ;
> l'écran, lui, ne dépend pas d'un job nocturne pour dire la vérité.

---

## 7. Domaine — La boucle de valeur

### `objectives`
| Colonne | Type | Notes |
|---|---|---|
| `id` `organization_id` `project_id` | uuid | |
| `objective_type_id` | uuid FK taxonomie | business, marketing, communication, commercial, opérationnel, financier |
| `title` `description` | text | |
| `metric_id` | uuid FK `metrics` NULL | si l'objectif est chiffré |
| `target_value` | numeric(20,4) NULL | |
| `unit` | text NULL | |
| `currency` | char(3) NULL | ex. « générer 5 000 000 FCFA » |
| `period_start` `period_end` | date | |
| `status` | objective_status | |
| `owner_user_id` | uuid | |
| `is_client_visible` | boolean DEFAULT true | |
| `current_value` | numeric(20,4) NULL | **dénormalisé**, recalculé à chaque résultat |
| `achievement_percent` | int NULL | **dénormalisé** |

**Calcul de l'écart** — le service `objectives` agrège :
```sql
SELECT metrics.aggregation_fn(rm.value)
FROM result_metrics rm
JOIN results r ON r.id = rm.result_id
WHERE rm.organization_id = :org
  AND rm.metric_id       = :metric
  AND (rm.objective_id = :objective OR (rm.objective_id IS NULL AND r.project_id = :project))
  AND r.recorded_for BETWEEN :period_start AND :period_end
```
→ `gap = current_value - target_value` · `achievement_percent = current/target × 100`
La direction (`higher_is_better` / `lower_is_better`) décide si un écart est bon ou mauvais.

### `actions`
| Colonne | Type | Notes |
|---|---|---|
| `id` `organization_id` `project_id` | uuid | |
| `title` `description` | text | |
| `status` | action_status DEFAULT `'todo'` | |
| `priority` | priority_level DEFAULT `'normal'` | |
| `action_type_id` | uuid FK | **détermine le formulaire de résultats** |
| `category_id` `channel_id` | uuid FK NULL | |
| `assignee_id` | uuid NULL | **le responsable** |
| `start_date` `due_date` | date NULL | |
| `due_at` | timestamptz NULL | calculé depuis `due_date` + fuseau du projet |
| `completed_at` | timestamptz NULL | |
| `estimated_minutes` `spent_minutes` | int NULL | saisie manuelle au MVP |
| `is_client_visible` | boolean DEFAULT false | |
| `blocked_reason` | text NULL | |
| `objective_id` | uuid NULL | rattachement direct optionnel à un objectif |
| `source_insight_id` | uuid NULL | **← « prochaine action » issue d'un insight : la boucle se referme ici** |
| `position` | int | ordre manuel (kanban) |

**FK composites** sur `project_id`, `objective_id`, `source_insight_id`, `assignee_id`.
Index : `(organization_id, project_id, status)`, `(organization_id, assignee_id, due_date)`, `(organization_id, due_date) WHERE status NOT IN ('done','cancelled')`.

### `action_collaborators`
`id` · `organization_id` · `action_id` · `user_id` — **UNIQUE (organization_id, action_id, user_id)**

### `deliverables`
`id` · `organization_id` · `project_id` · `action_id` NULL · `title` · `description` ·
`deliverable_type_id` FK · `status deliverable_status DEFAULT 'draft'` · `owner_user_id` ·
`current_version_id` NULL · `due_date` · `is_client_visible` · `sent_to_client_at` ·
`approved_at` · `approved_by` · `published_at` · `external_url text NULL` *(type lien / site web)*

Machine à états (garantie par le service, testée) :
`draft → production → internal_review → {production | client_review}` ·
`client_review → {approved | changes_requested}` · `changes_requested → production` · `approved → published`

### `deliverable_versions`
`id` · `organization_id` · `deliverable_id` · `version int` · `file_id` NULL · `external_url` NULL ·
`notes` · `created_by` · `created_at` — **UNIQUE (organization_id, deliverable_id, version)**

### `deliverable_reviews`
`id` · `organization_id` · `deliverable_id` · `version_id` · `scope review_scope` ·
`decision review_decision` · `comment text` · `reviewer_user_id` · `created_at`
→ Une demande de modification client crée une ligne `scope='client'`, `decision='changes_requested'`,
**rattachée à la version exacte** et convertie en commentaire partagé.

### `results` — le cœur du produit
| Colonne | Type | Notes |
|---|---|---|
| `id` `organization_id` `project_id` | uuid | |
| `action_id` | uuid NULL | un résultat peut être rattaché à une action ou au projet |
| `objective_id` | uuid NULL | rattachement explicite |
| `template_id` | uuid FK `result_form_templates` NULL | gabarit utilisé |
| `title` | text NULL | |
| `recorded_for` | date NOT NULL | **date du résultat**, ≠ date de saisie |
| `period_start` `period_end` | date NULL | pour les résultats de campagne |
| `analysis` | text NULL | **« What did we learn? »** |
| `recommendation` | text NULL | **« What should we do next? »** |
| `recorded_by` | uuid | |
| `is_client_visible` | boolean DEFAULT false | |
| `created_at` `updated_at` `deleted_at` | | |

### `result_metrics` — le quantitatif, normalisé
`id` · `organization_id` · `result_id` · `metric_id` · `field_key text` · `value numeric(20,4)` ·
`unit text` · `currency char(3) NULL` · `objective_id` NULL ·
`project_id` `client_id` `channel_id` `action_type_id` `recorded_for date` *(dénormalisés pour l'analytique)*

**UNIQUE (organization_id, result_id, field_key)**
Index : `(organization_id, metric_id, recorded_for)`, `(organization_id, project_id, metric_id)`, `(organization_id, client_id, metric_id, recorded_for)`

> **Pourquoi normaliser plutôt que stocker un JSONB** : le module Results doit filtrer et agréger par client,
> projet, période, collaborateur, canal et type d'action. Un JSONB rendrait ces requêtes lentes et non typées.
> Les dimensions sont dénormalisées sur la ligne pour éviter quatre jointures sur chaque dashboard.

### `result_notes` — le qualitatif
`id` · `organization_id` · `result_id` · `kind result_note_kind` · `body text` · `sort_order`
→ observations, retours public, retours client, difficultés, points positifs / négatifs, enseignements, opportunités.
Une table plutôt que huit colonnes : les rapports itèrent dessus génériquement et la liste peut s'enrichir sans migration.

### `insights`
`id` · `organization_id` · `project_id` NULL · `client_id` NULL ·
`title` · `what_worked text` · `what_didnt text` · `what_we_learned text` · `recommendation text` ·
`period_start` `period_end` · `is_client_visible` · `created_by` · `created_at`

### `insight_results` *(n↔n)* — les résultats qui fondent l'insight
`organization_id` · `insight_id` · `result_id` — **PK (insight_id, result_id)**

### `insight_actions` *(n↔n)* — les actions nées de la recommandation
`organization_id` · `insight_id` · `action_id` · `created_at` — **PK (insight_id, action_id)**

> `actions.source_insight_id` porte la relation principale (la prochaine action) ;
> `insight_actions` permet d'en rattacher plusieurs et de garder la traçabilité.

---

## 8. Domaine — Pilotage

### `project_health_snapshots`
`id` · `organization_id` · `project_id` · `score int` · `status health_status` ·
`factors jsonb` · `computed_at timestamptz`

`factors` est un tableau structuré et **traduisible** :
```json
[
  { "code": "overdue_actions",   "weight": 0.25, "score": 30,
    "params": { "count": 3 } },
  { "code": "pending_validation","weight": 0.20, "score": 45,
    "params": { "count": 1, "days": 3 } },
  { "code": "next_deadline",     "weight": 0.15, "score": 60,
    "params": { "hours": 48 } }
]
```
Le rendu « 3 actions sont en retard. 1 validation client est en attente depuis 3 jours. » est produit
par le catalogue i18n à partir de `code` + `params` → **l'explication est disponible en FR et en EN sans recalcul**.

Facteurs du MVP : `progress_vs_schedule`, `overdue_actions`, `deadline_compliance`, `pending_validation`,
`open_risks`, `blocked_actions`, `workload`, `missing_results`.
Pondérations dans `organizations.settings.health.weights`, valeurs par défaut en seed.

### `risks`
`id` · `organization_id` · `project_id` · `kind risk_kind` · `title` · `description` ·
`level risk_level` · `impact text` · `probability text NULL` · `owner_user_id` ·
`identified_on date` · `mitigation_plan text` · `status risk_status` · `resolved_at` · `is_client_visible`

### `meetings`
`id` · `organization_id` · `project_id` NULL · `client_id` NULL · `title` ·
`scheduled_at timestamptz` · `duration_minutes int` · `location text` · `meeting_url text` ·
`agenda text` · `objectives text` · `notes text` · `problems text` · `summary text` *(compte rendu)* ·
`status` (`scheduled`/`held`/`cancelled`) · `is_client_visible` · `created_by`

### `meeting_participants`
`id` · `organization_id` · `meeting_id` · `user_id` NULL · `client_contact_id` NULL · `attended boolean`
*(contrainte : exactement l'un des deux renseigné)*

### `meeting_decisions`
`id` · `organization_id` · `meeting_id` · `body text` · `owner_user_id` NULL · `due_date` ·
`action_id` NULL — **« une décision devient une action »**

---

## 9. Domaine — Collaboration

### `comments`
`id` · `organization_id` · `entity_type entity_type` · `entity_id uuid` ·
`project_id` NULL · `client_id` NULL *(dénormalisés pour RLS portail et filtres)* ·
`author_user_id` · `body text` · `visibility visibility NOT NULL DEFAULT 'internal'` ·
`parent_comment_id` NULL · `edited_at` · `deleted_at`

> ⚠️ `visibility = 'internal'` par défaut. Un commentaire ne devient visible du client
> que par un geste explicite. C'est la garantie « le client ne voit jamais les notes internes ».

### `comment_mentions`
`organization_id` · `comment_id` · `user_id` — PK (comment_id, user_id) → déclenche une notification.

### `files`
`id` · `organization_id` · `storage_key text UNIQUE` *(opaque, préfixée par le locataire)* ·
`filename` · `mime_type` · `size_bytes bigint` · `checksum sha256` · `uploaded_by` ·
`is_client_visible` *(défaut `false`)* · `created_at` · `deleted_at`
**UNIQUE (organization_id, id)** — cible des FK composites (`clients.logo_file_id`, pièces jointes)

> Jamais d'accès public. Lien signé ≤ 5 min, émis **après** le contrôle de permission et dans la
> transaction locataire (R13, ADR-037). `mime_type` est le type **lu dans les octets**, pas celui
> annoncé par l'extension ou l'en-tête. La clé de stockage ne quitte jamais le serveur.

### `attachments`
`id` · `organization_id` · `file_id` · `entity_type` · `entity_id` · `project_id` NULL · `created_by`
**UNIQUE (organization_id, file_id, entity_type, entity_id)**

---

## 10. Domaine — Restitution

### `reports`
| Colonne | Type | Notes |
|---|---|---|
| `id` `organization_id` | uuid | |
| `type` | report_type | |
| `title` | text | |
| `project_id` `client_id` | uuid NULL | périmètre |
| `period_start` `period_end` | date NOT NULL | |
| `locale` | locale_code NOT NULL | **langue du rapport, indépendante de l'interface** |
| `status` | report_status DEFAULT `'draft'` | |
| `settings` | jsonb | sections incluses, options d'affichage |
| `generated_at` `published_at` | timestamptz NULL | |
| `snapshot` | jsonb NULL | **données figées à la publication** |
| `created_by` `updated_by` | uuid | |

### `report_sections`
`id` · `organization_id` · `report_id` · `key report_section_key` · `sort_order` ·
`is_included boolean` · `is_client_visible boolean` · `title_override text NULL` ·
`body text NULL` *(saisie humaine)* · `data jsonb NULL` *(données pré-remplies)* · `is_edited boolean`
**UNIQUE (report_id, key)**

> Chaque section a un **fournisseur de données** indépendant (`modules/reports/providers/*`).
> Si un fournisseur échoue, la section est livrée vide et éditable : le rapport n'est jamais bloqué (R7).

### `report_shares`
`id` · `organization_id` · `report_id` · `token_hash text UNIQUE` · `password_hash text NULL` ·
`expires_at timestamptz NOT NULL` · `revoked_at` · `view_count int` · `last_viewed_at` ·
`recipient_email` · `created_by`

### `report_exports`
`id` · `organization_id` · `report_id` · `format export_format` · `file_id` · `locale` ·
`generated_at` · `generated_by` *(MVP : `pdf` uniquement ; `xlsx`/`csv` prêts pour la V2)*

---

## 11. Domaine — Système

### `notifications`
`id` · `organization_id` · `user_id` · `type text` · `entity_type` · `entity_id` ·
`project_id` NULL · `params jsonb` *(pour le rendu localisé)* · `read_at` · `created_at`
→ Le texte n'est **jamais stocké** : on stocke `type` + `params`, on rend dans la langue du lecteur.

### `notification_preferences`
`organization_id` · `user_id` · `type` · `in_app boolean` · `email boolean`
**PK (organization_id, user_id, type)**

### `activity_events` — fil d'activité et historique client
`id` · `organization_id` · `actor_user_id` NULL · `verb text` *(`action.completed`, `deliverable.approved`, `result.recorded`, `insight.created`, `report.generated`…)* ·
`entity_type` · `entity_id` · `project_id` NULL · `client_id` NULL ·
`params jsonb` · `visibility visibility DEFAULT 'internal'` · `created_at`
Index : `(organization_id, project_id, created_at DESC)`, `(organization_id, client_id, created_at DESC)`

### `audit_logs` — sécurité, insertion seule
`id` · `organization_id` NULL · `actor_user_id` NULL · `action text` · `entity_type` · `entity_id` ·
`before jsonb` · `after jsonb` · `ip inet` · `user_agent` · `created_at`
→ Aucun `UPDATE`/`DELETE` accordé, même à `app_user`. Accès support d'un `platform_admin` systématiquement journalisé.

### `xp_events`
`id` · `organization_id` · `user_id` · `rule_code text` · `points int` ·
`entity_type` · `entity_id` · `idempotency_key text` · `created_at`
**UNIQUE (organization_id, idempotency_key)** → une action terminée deux fois ne rapporte pas deux fois les points.

### `user_badges`
`organization_id` · `user_id` · `badge_id` · `awarded_at` — **PK (organization_id, user_id, badge_id)**

### Files de jobs
Schéma `pgboss` géré par la bibliothèque, dans la même base, **hors RLS** (accès `app_migrator`/worker uniquement).

---

## 12. Relations entre entités

```
organizations ─1─┬─n─ memberships ─n─1─ users
                 ├─n─ clients ─1─n─ client_contacts
                 │        └─1─n─ projects
                 ├─n─ subscriptions
                 └─n─ (toutes les tables applicatives via organization_id)

users ─1─n─ client_user_access ─n─1─ clients        (portée du portail client)

clients ─1─n─ projects ─1─┬─n─ project_members ─n─1─ users
                          ├─n─ milestones
                          ├─n─ objectives ──────────┐
                          ├─n─ actions              │
                          ├─n─ deliverables         │
                          ├─n─ results              │
                          ├─n─ insights             │
                          ├─n─ risks                │
                          ├─n─ meetings             │
                          ├─n─ reports              │
                          └─n─ project_health_snapshots

                            ┌──────── LA BOUCLE ────────┐
objectives ─1─n─ actions ─1─n─ deliverables            │
     ▲            │  │              │                  │
     │            │  └─1─n─ results ┘                  │
     │            │          ├─1─n─ result_metrics ────┤ (alimente current_value)
     │            │          └─1─n─ result_notes       │
     │            │                │                   │
     │            │       insight_results              │
     │            │                ▼                   │
     │            └── source_insight_id ── insights ───┘
     │                                         │
     └─────── objectives.metric_id ─── metrics ┘

action_types ─1─n─ result_form_templates ─1─n─ result_form_fields ─n─1─ metrics
     └─1─n─ actions                                    (le formulaire intelligent)

deliverables ─1─n─ deliverable_versions ─1─n─ deliverable_reviews
                                                 └─ reviewer = user client → validation client

reports ─1─n─ report_sections
        ├─1─n─ report_shares
        └─1─n─ report_exports ─n─1─ files

meetings ─1─n─ meeting_participants (user | client_contact)
         └─1─n─ meeting_decisions ─0..1─ actions        (décision → action)

comments / attachments / activity_events / notifications
   └─ (entity_type, entity_id) → polymorphe vers client | project | action | objective |
                                  deliverable | result | insight | report | risk | meeting | milestone

files ─1─n─ attachments · deliverable_versions · report_exports · avatars · logos
```

### Cardinalités notables

| Relation | Cardinalité | Règle |
|---|---|---|
| `organization` → toutes entités | 1─n | **Frontière absolue**, RLS |
| `user` → `organizations` | n─n via `memberships` | Un rôle **par** organisation |
| `client user` → `clients` | n─n via `client_user_access` | Portée du portail |
| `project` → `client` | n─1 (optionnel) | Projet interne possible |
| `action` → `result` | 1─n | Une action peut produire plusieurs résultats (mensuels) |
| `result` → `objective` | n─1 (optionnel) | Rattachement explicite ou par métrique + période |
| `insight` → `results` | n─n | Un insight se fonde sur plusieurs résultats |
| `insight` → `actions` | 1─n | La recommandation engendre des actions |
| `deliverable` → `versions` | 1─n | Versionnage obligatoire |
| `version` → `reviews` | 1─n | Validation interne **et** client sur la même version |
| `meeting_decision` → `action` | 1─0..1 | Conversion optionnelle |

### Suppressions

| Parent supprimé | Comportement |
|---|---|
| `organizations` | Purge complète différée (job), après export RGPD |
| `clients` | `RESTRICT` s'il reste des projets actifs ; sinon suppression logique en cascade |
| `projects` | Suppression logique en cascade (actions, livrables, résultats, insights, risques conservés et masqués) |
| `actions` | `results.action_id → SET NULL` (**on ne perd jamais un résultat**) |
| `users` | `SET NULL` sur `assignee_id`, `created_by`… Jamais de suppression physique : désactivation |
| `results` | `CASCADE` sur `result_metrics` et `result_notes` |
| `files` | Suppression logique + purge de l'objet R2 par job |

---

## 13. Row Level Security — application

```sql
-- Pour CHAQUE table applicative :
ALTER TABLE <t> ENABLE  ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE   ROW LEVEL SECURITY;   -- s'applique même au propriétaire de la table

CREATE POLICY tenant_all ON <t> FOR ALL TO app_user
  USING      (organization_id = current_setting('app.organization_id')::uuid)
  WITH CHECK (organization_id = current_setting('app.organization_id')::uuid);
```

**Tables exposées au portail** (`projects`, `actions`, `objectives`, `deliverables`, `deliverable_versions`,
`results`, `result_metrics`, `result_notes`, `reports`, `report_sections`, `milestones`, `risks`, `comments`,
`files`, `activity_events`) reçoivent en plus une politique `app_portal` en **lecture seule**, exigeant :
`organization_id` correspondant **ET** `is_client_visible = true` **ET** appartenance à un projet
d'un client listé dans `app.client_ids`.

### 13.1. Schéma `portal` — isolation au niveau **colonne** *(ADR-026)*

RLS filtre des **lignes**, pas des **colonnes**. Or certaines colonnes ne doivent jamais atteindre le client :
`health_score`, `health_status` (décision Q10 — la santé projet est un outil **interne**, ADR-025),
`budget_amount`, `spent_minutes`, `estimated_minutes`, `blocked_reason`, `account_team_note`, `open_risks_count`.

Le portail ne lit donc **aucune table directement** : il lit des vues à liste de colonnes explicite.

```sql
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM app_portal;

CREATE VIEW portal.projects WITH (security_invoker = true) AS
  SELECT id, organization_id, client_id, name, description, status, color,
         start_date, end_date, progress_percent
    FROM public.projects;                 -- ni health_score, ni budget, ni compteurs internes

GRANT SELECT ON portal.projects TO app_portal;
```

`security_invoker = true` (PostgreSQL 15+) fait appliquer les politiques RLS **avec les droits de `app_portal`** :
les deux barrières se cumulent, la vue ne les contourne pas.

**Conséquence** : ajouter une colonne à une table n'en fait **jamais** une colonne visible du client.
Il faut un geste explicite dans la vue. Un test vérifie que `app_portal` n'a aucun droit sur `public`.

**Colonnes interdites au portail, en toutes circonstances** :
`health_score` · `health_status` · `budget_amount` · `budget_currency` · `estimated_minutes` ·
`spent_minutes` · `blocked_reason` · `account_team_note` · `open_risks_count` · `actions_overdue` ·
`created_by` / `updated_by` (identité interne) · `settings` · tout champ de `memberships`.

Écritures autorisées au portail, et **uniquement** celles-ci :
`deliverable_reviews` (approbation / demande de modification), `comments` avec `visibility='shared'`,
`notifications` (marquage lu), `users` (ses propres préférences).

**Sans RLS** : `users`, `sessions`, `accounts`, `verifications`, `audit_logs`, schéma `pgboss` —
accès restreint applicativement, jamais atteignables par le pool portail.

---

## 14. Index principaux

```sql
-- Tenancy
CREATE INDEX ON memberships        (organization_id, user_id);
CREATE INDEX ON client_user_access (organization_id, user_id);

-- Travail quotidien
CREATE INDEX ON actions (organization_id, assignee_id, status, due_date);
CREATE INDEX ON actions (organization_id, project_id, status);
CREATE INDEX ON actions (organization_id, due_date)
  WHERE status NOT IN ('done','cancelled') AND deleted_at IS NULL;   -- « en retard »

-- Validation client
CREATE INDEX ON deliverables (organization_id, status, due_date);
CREATE INDEX ON deliverables (organization_id, project_id, is_client_visible);

-- Analytique résultats
CREATE INDEX ON result_metrics (organization_id, metric_id, recorded_for);
CREATE INDEX ON result_metrics (organization_id, client_id, metric_id, recorded_for);
CREATE INDEX ON result_metrics (organization_id, project_id, metric_id);

-- Fils et notifications
CREATE INDEX ON activity_events (organization_id, project_id, created_at DESC);
CREATE INDEX ON activity_events (organization_id, client_id, created_at DESC);
CREATE INDEX ON notifications   (organization_id, user_id, read_at, created_at DESC);

-- Recherche globale : colonne tsvector générée + GIN sur clients, projects, actions,
-- deliverables, results, insights, reports (FR + EN via 'simple' + unaccent)
CREATE INDEX ON projects USING GIN (search_tsv);
```

---

## 15. Données de seed (référentiel système)

Livrées à l'installation, `organization_id = NULL`, libellés FR **et** EN :

- **Types d'action** : social_post · ads_campaign · website_build · content_production · event · email_campaign · design · meeting · admin · other
- **Catégories** : marketing · communication · commercial · production · gestion · support
- **Canaux** : facebook · instagram · linkedin · tiktok · youtube · google_ads · meta_ads · email · site_web · presse · radio · tv · terrain · whatsapp
- **Types de livrable** : image · video · document · presentation · article · script · graphic_file · link · website · other
- **Types d'objectif** : business · marketing · communication · commercial · operational · financial
- **Métriques** : les 24 du §5
- **Gabarits de résultats** : Social Media Post · Ads Campaign · Website Build · Content Production · Event · Generic
- **Règles XP** : action_completed 10 · deadline_respected 15 · result_reported 20 · project_completed 100
- **Niveaux** : 1 (0) · 2 (100) · 3 (300) · 4 (700) · 5 (1500) · 6 (3000) · 7 (6000) · 8 (12000)
- **Badges** : first_result · ten_results · perfect_month · project_finisher · deadline_keeper · insight_maker
- **Pondérations santé** : progress 0.25 · deadlines 0.25 · overdue 0.20 · validations 0.10 · risks 0.10 · workload 0.10

> Une organisation peut désactiver un élément système et créer les siens. **Rien de tout cela n'est écrit dans le code.**


---

## 16. Multi-devise *(validé — ADR-024)*

**MVP : stockage et affichage uniquement. Aucune conversion, aucun taux de change.**

| Règle | Détail |
|---|---|
| Tout montant est un **couple** | `numeric(18,2)` + `char(3)` ISO-4217. Jamais un montant nu |
| Colonnes concernées | `projects.budget_amount/currency` · `objectives.target_value/currency` · `result_metrics.value/currency` · `organizations.default_currency` |
| Devise par défaut | `organizations.default_currency` (`XOF`, `EUR`, `USD`…) — pré-remplit les formulaires, ne contraint rien |
| **Interdiction absolue** | Ne **jamais** sommer deux devises. Tout agrégat monétaire est `GROUP BY currency` |
| Affichage | `Intl.NumberFormat(locale, { style:'currency', currency })` — la locale décide du **format**, la donnée décide de la **devise** |
| Objectifs | L'écart n'est calculé que si objectif et résultats partagent la devise ; sinon l'interface le signale au lieu d'afficher un chiffre faux |
| Rapports | Une section de résultats monétaires affiche une ligne par devise |

**Préparation de la V2 (conversion)** — rien à construire maintenant, mais le modèle le permet déjà :
une table `exchange_rates (base_currency, quote_currency, rate numeric(18,8), valid_on date, source)`
et deux colonnes optionnelles `amount_base` / `rate_used` sur les lignes monétaires suffiront.
**Le point important est acquis dès le MVP** : chaque montant porte sa devise, donc aucune donnée
historique ne sera ambiguë le jour où la conversion arrivera.

---

## 17. Volumétrie et montée en charge *(validé — ADR-022)*

Cible à 12 mois : ~100 organisations · ~1 000 projets · ~100 000 actions ·
plusieurs centaines de milliers de résultats et d'événements.

Ces volumes sont **confortables** pour une instance PostgreSQL unique. Les seuils de bascule et les
actions correspondantes — toutes sans refonte du modèle — sont détaillés dans `docs/architecture.md` §9.0.

Dispositions prises **dès le MVP** parce qu'elles coûtent cher à ajouter après coup :

1. `organization_id` sur toutes les tables et en tête de tous les index → extraction d'une organisation vers une base dédiée possible à tout moment.
2. Pagination **par curseur** partout (`(created_at, id)`), jamais `OFFSET`.
3. `activity_events` et `result_metrics` conçues comme des tables **append-only**, sans `UPDATE` → partitionnement déclaratif ajoutable plus tard sans réécriture applicative.
4. Compteurs dénormalisés sur `projects` (ADR-013) → les listes ne dépendent pas du volume d'actions.
5. Vue matérialisée `result_metrics_daily` prévue dès le LOT 7, activée dès que la table dépasse ~200 000 lignes.
