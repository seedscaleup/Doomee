# CLAUDE.md — Règles permanentes du projet Doomee

> Ce fichier est la mémoire du projet. **Le lire entièrement avant toute session de développement.**
> Détails : `docs/cahier-des-charges.md` (quoi) · `docs/architecture.md` (comment) ·
> `docs/database.md` (schéma) · `docs/roadmap.md` (ordre) · `docs/decisions.md` (pourquoi).

---

## 1. Le produit en une phrase

Doomee est un SaaS multi-tenant de gestion de projets **et de mesure des résultats** :
il permet à une équipe de montrer **ce qui a été fait, pourquoi, ce que cela a produit,
ce qui a été appris et ce qu'il faut faire ensuite**.

**Signature** : *Do. Track. Show.* — **Promesse** : *Turn work into visible results.*

### La boucle centrale — c'est le produit

```
OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → ANALYSE → INSIGHT → RECOMMANDATION → PROCHAINE ACTION
```

**Avant d'écrire quoi que ce soit, se demander : « est-ce que ça aide à parcourir cette boucle ? »**
Si non, ce n'est pas prioritaire. Doomee n'est **pas** un gestionnaire de tâches.

---

## 2. État d'avancement

| | |
|---|---|
| **Phase actuelle** | **LOT 5 terminé et vérifié** — `pnpm verify` vert. **CHECKPOINT 1 atteint (LOT 0 → 5)** |
| **Branche de travail** | `claude/laughing-keller-gd9tu8` |
| **Dernier jalon** | Domaine action : `actions` · `action_collaborators` · `comments` · `attachments` + taxonomies seedées, création rapide, kanban, **My Work**, **Focus Mode**, commentaires internes par défaut, compteurs projet réécrits en transaction |
| **Prochaine étape** | **LOT 6 — objectifs**, après validation du CHECKPOINT 1 |
| **Décisions tranchées** | O1, O2, O3, O5, O7, O10 — voir §14 bis et `docs/decisions.md` |

> ⚠️ **Mettre ce tableau à jour à la fin de chaque session.** C'est ce qui permet à la session
> suivante de reprendre sans perdre le contexte.

---

## 3. Les 12 règles non négociables

1. 🔒 **Aucune requête ne franchit la frontière `organization_id`.** Tout passe par `withTenant()`. Le client de base brut n'est jamais exporté ni importé ailleurs.
2. 🔒 **Le client ne voit jamais l'interne.** Le portail utilise le rôle PostgreSQL `app_portal` et ne lit **que** les vues `portal.*` à colonnes explicites (ADR-026). `is_client_visible` est en **opt-in** (défaut `false`), `comments.visibility` vaut `'internal'` par défaut. **Le Health Score n'est jamais exposé au client** (ADR-025).
3. 🔒 **On ne contourne jamais un contrôle de sécurité pour avancer plus vite.** Pas de `BYPASSRLS`, pas de `// TODO: sécuriser plus tard`, pas de requête « juste pour déboguer » qui reste.
4. **Toute écriture passe par `defineAction`**, toute lecture par `defineQuery`. Aucun autre chemin.
5. **TypeScript `strict`.** Pas de `any`, pas de `@ts-ignore`, pas de `as` sauf après un `satisfies` ou une validation Zod.
6. **Aucune chaîne visible en dur.** Tout passe par next-intl. `fr.json` et `en.json` ont exactement les mêmes clés.
7. **Aucune donnée métier en dur.** Types d'action, canaux, catégories, types de livrables, types d'objectifs, métriques, formulaires de résultats, barème XP, pondérations de santé → **en base**, avec `labels jsonb {fr,en}`.
8. **Composants réutilisables, sans abstraction prématurée.** Un motif visuel devient un composant **à sa troisième occurrence**, pas avant.
9. **Mobile d'abord.** Conception à 375 px, cibles tactiles ≥ 44 px. Le portail client est surtout consulté sur mobile.
10. **Less typing.** Chaque champ ajouté à un formulaire doit être justifié. Pré-remplir tout ce qui peut l'être.
11. **Une PR qui touche au schéma touche aux tests d'isolation.** Sinon elle est refusée.
12. **Un lot ne démarre pas si le précédent n'est pas « terminé »** au sens de `docs/roadmap.md` §1.
13. 🌍 **Aucune dépendance à un hébergeur.** Node.js uniquement (jamais l'Edge Runtime), PostgreSQL standard, et **aucun SDK d'infrastructure hors `src/lib/storage` et `src/lib/mail`** — chacun avec deux implémentations testées (ADR-021).
14. 💱 **Tout montant porte sa devise.** Ne **jamais** sommer deux devises : tout agrégat monétaire est `GROUP BY currency` (ADR-024).

---

## 4. Stack

| | |
|---|---|
| Next.js 15 (App Router, RSC, Server Actions) · TypeScript strict · Node 22 | |
| PostgreSQL 16 + **RLS** · **Drizzle ORM** + drizzle-kit | ADR-002, ADR-004 |
| **Better Auth** (auto-hébergé) | ADR-003 |
| Tailwind v4 · composants possédés sur `<dialog>` natif (ADR-031) · next-intl · Zod | |
| pg-boss (jobs) · `StorageAdapter` S3-compatible · `MailAdapter` (SMTP par défaut) + React Email · @react-pdf/renderer | ADR-007, ADR-015, ADR-021 |
| Vitest + Testcontainers · Playwright · Biome · Lefthook · pnpm | |

**On n'utilise pas** : tRPC/GraphQL, Redux/Zustand global, Redis (au MVP), microservices, ORM masquant le SQL,
**Edge Runtime**, ni aucune API propriétaire d'hébergeur.

**Hébergement** : Union Européenne, en conteneur Docker (`output: 'standalone'`). Le choix de l'hébergeur
est **réversible par construction** et n'est arrêté qu'au LOT 15 (ADR-021).

---

## 5. Architecture — la règle d'or

```
src/app/        interface — routes, pages, layouts.  AUCUNE logique métier, AUCUN SQL.
src/modules/    un module par domaine :
                  schemas.ts  contrats Zod
                  queries.ts  lectures (RSC)
                  mutations.ts Server Actions
                  service.ts  logique PURE (pas d'I/O) — c'est ce qu'on teste unitairement
                  policy.ts   permissions du domaine
                  components/ composants du domaine
src/db/         schéma, migrations, politiques RLS, seed, tenant.ts
src/lib/        auth, permissions, i18n, storage, mail, jobs, errors
src/server/     defineAction / defineQuery / context — le portail d'accès obligatoire
```

**Dépendances** : `app → modules → db|lib`. Jamais l'inverse.
Un module n'importe un autre module **que par son `index.ts`**.

⚠️ **`index.ts` est une entrée SERVEUR** (ADR-030). Un composant **client** importe le fichier précis :
`mutations.ts` (`'use server'`) ou `service.ts` (pur). Toute surface serveur porte `import 'server-only'`,
donc un import client fautif échoue au build au lieu de casser le bundle en silence.
`service.ts` est pur : pas de `db`, pas de `headers()`, pas de `fetch`. Testable sans infrastructure.

---

## 6. Sécurité — les trois barrières

```
1. AUTHENTIFICATION   session valide ?                        (Better Auth)
2. AUTORISATION       rôle + portée                            (can(), PERMISSIONS, project_members, client_user_access)
3. ISOLATION          lignes   : la base refuse si 1 et 2 sont buguées   (RLS, app_user / app_portal)
                      colonnes : vues portal.* security_invoker          (ADR-026)
```

- La matrice `PERMISSIONS` est une **donnée typée**, pas des `if (role === 'manager')` dispersés.
- L'interface masque, elle ne sécurise pas. Elle appelle la **même** fonction `can()`.
- Rôles : `platform_admin` (hors org) · `owner` · `direction` · `manager` · `collaborator` · `client` (ADR-012).
- `owner` est un rôle **d'organisation** porté par `memberships`, soumis à RLS comme tout membre.
  `platform_admin` est un attribut de `users`, hors organisation. Les deux ne se substituent jamais.
- Un client atteignant une URL interne reçoit **404**, jamais 403 (ne pas confirmer l'existence).
- Toute action sensible est écrite dans `audit_logs` (table en insertion seule).

---

## 7. Base de données — conventions

| | |
|---|---|
| `uuid v7` · `snake_case` · tables au pluriel | |
| `organization_id uuid NOT NULL` sur **toutes** les tables applicatives, même redondant | |
| FK intra-tenant **composites** : `(organization_id, parent_id) → parents(organization_id, id)` | |
| Tout index commence par `organization_id` | |
| `timestamptz` UTC · `deleted_at` (suppression logique) · `created_by` / `updated_by` | |
| Argent : `numeric(18,2)` + `currency char(3)`. Métriques : `numeric(20,4)`. **Jamais de float** | |
| **Enum** = machine à états (code) · **Table de référence** = classification (donnée) | ADR-010 |
| Tout montant = `numeric(18,2)` + `currency char(3)`. **Agrégat monétaire toujours `GROUP BY currency`** | ADR-024 |
| Pagination **par curseur** `(created_at, id)`, jamais `OFFSET` | ADR-022 |
| `activity_events` et `result_metrics` sont **append-only** (partitionnables plus tard) | ADR-022 |
| Toute nouvelle table : `ENABLE` **et** `FORCE ROW LEVEL SECURITY` + politique + test d'isolation | |

**Migrations** : générées par `drizzle-kit`, **relues à la main**, politiques RLS ajoutées manuellement.

---

## 8. Internationalisation — trois langues distinctes

| Langue | Source | Portée |
|---|---|---|
| Interface | `users.locale` | Écrans, menus, statuts, erreurs |
| Notifications | `users.locale` **du destinataire** | E-mails, notifications |
| **Reporting** | `users.report_locale`, surchargée par `reports.locale` | PDF et rapports — **indépendante de l'interface** |

- Les notifications stockent `type` + `params`, **jamais le texte** : le rendu se fait dans la langue du lecteur.
- Le rendu hors écran (e-mails, PDF) reçoit la locale en **paramètre explicite**, jamais du contexte de requête.
- Dates, nombres, devises : API `Intl` avec le fuseau et le format de l'utilisateur. Jamais de formatage manuel.
- Le **contenu utilisateur n'est pas traduit** au MVP (ADR-019).
- Devise = attribut de la donnée, pas de la locale.

---

## 9. Design

```css
--doomee-yellow: #FFD21F;  --doomee-black: #111111;
--background: #FAFAF7;     --surface: #FFFFFF;   --border: #E8E8E3;
--success: #22A06B;        --danger: #E5484D;    --warning: #F59E0B;
```

- **Règle du jaune** : couleur d'**action et d'énergie**. Un seul élément jaune dominant par écran. Jamais en fond large. Texte sur jaune toujours `#111111`.
- Jamais de couleur en dur dans un composant : passer par les jetons.
- 🎨 **Aplat ≠ texte** (ADR-032). Les couleurs de marque servent aux **aplats, bordures et points** (seuil 3:1).
  Dès qu'une couleur porte du **texte**, utiliser sa sœur `-text` : `text-success-text`, `text-danger-text`,
  `text-warning-text`, `text-info-text`. `tests/unit/contrast.test.ts` lit `globals.css` et échoue sinon.
- **L'orange n'est jamais seul porteur de sens** : toujours accompagné d'un libellé ou d'une bordure.
- Personnalité : simple · fun · smart · dynamique · professionnelle · humaine. **Jamais infantilisant.**
- Contraste AA minimum, focus visible, navigation clavier complète.

**Les 5 principes UX** : *Less typing* · *One thing at a time* · *Show progress* · *Smart defaults* · *Every action leads somewhere*.

---

## 10. Tests

| Niveau | Outil | Portée |
|---|---|---|
| Unitaire | Vitest | `service.ts` (pur) — **≥ 90 % de couverture, bloquant** |
| Intégration | Vitest + Testcontainers | Base **réelle**, RLS réelle, Server Actions |
| E2E | Playwright | Les 15 critères MVP, **en FR et en EN**, desktop + mobile |

**Suites obligatoires, générées depuis le schéma** (impossible de les oublier en ajoutant une table) :
- Isolation tenant : org A ne lit/écrit/modifie/supprime rien de org B, **sur chaque table**.
- Fuite portail : sur chaque table exposée, pas d'interne, pas d'autre client, pas de `is_client_visible = false`.
- Matrice de permissions, confrontée au §3.2 du cahier des charges.
- RLS activée et forcée sur chaque table applicative.

**Règles** : jamais de mock de la base · une organisation par test · tout correctif commence par un test qui échoue.

---

## 11. Commandes

```bash
pnpm dev              # serveur de développement
pnpm db:up            # PostgreSQL local (Docker)
pnpm db:generate      # générer la migration depuis le schéma
pnpm db:migrate       # appliquer les migrations
pnpm db:seed          # référentiel système + données de démo
pnpm test             # tests unitaires
pnpm test:integration # tests d'intégration (Testcontainers)
pnpm test:e2e         # Playwright
pnpm lint             # Biome (lint + format)
pnpm typecheck        # tsc --noEmit
pnpm check:i18n       # aucune chaîne visible en dur dans le JSX
pnpm check:boundaries # frontières de modules (dependency-cruiser)
pnpm verify           # tout, dans l'ordre de la CI
                      # (le nom `ci` est réservé par pnpm)
```

---

## 12. Conventions de code

- Identifiants, commentaires de code, messages de commit : **anglais**. Documentation (`docs/`) : **français**.
- Fichiers et dossiers en `kebab-case` ; composants React en `PascalCase`.
- Export nommé par défaut ; `export default` réservé aux pages et layouts Next.
- Les fonctions de service sont **pures** et prennent des arguments explicites (pas de lecture de contexte implicite).
- Erreurs : `AppError` typées avec une clé i18n. Jamais de `throw new Error("…")` visible par l'utilisateur.
- Commits : `type(scope): sujet` — ex. `feat(results): add smart result form renderer`.
- Une PR = un lot ou une sous-partie cohérente de lot. Description en français.

---

## 13. Pièges connus (déjà analysés — ne pas y retomber)

| | |
|---|---|
| ❌ Stocker les résultats en JSONB libre | → `result_metrics` normalisée (ADR-009, R4) |
| ❌ Recalculer la santé ou l'avancement dans une liste | → colonnes dénormalisées (ADR-013, R5) |
| ❌ `SET` global au lieu de `SET LOCAL` | → fuite de tenant entre requêtes du pool (R3) |
| ❌ Coder en dur un formulaire de résultats par métier | → gabarits en base (ADR-008) |
| ❌ Ajouter un statut dans une table de référence | → un statut est un enum, une classification est une table (ADR-010) |
| ❌ Traduire un statut depuis la base | → les états ont leurs libellés dans les catalogues i18n |
| ❌ Lire la locale du contexte dans un e-mail ou un PDF | → passer la locale en paramètre (ADR-011) |
| ❌ Servir un fichier par URL publique | → URL pré-signée ≤ 5 min après contrôle de permission (R13) |
| ❌ Régénérer un rapport publié depuis les tables vivantes | → lire le snapshot (ADR-014) |
| ❌ Un navigateur headless pour le PDF | → `@react-pdf/renderer` en job (ADR-015) |
| ❌ Calculer « en retard » sans fuseau horaire | → service pur, fuseau du projet (R9) |
| ❌ Sommer des montants de devises différentes | → `GROUP BY currency` (ADR-024) |
| ❌ Exposer `health_score` au portail client | → outil **interne** (ADR-025) ; absent des vues `portal.*` |
| ❌ Ajouter une colonne et croire qu'elle reste interne | → elle l'est **par défaut** ; l'exposer demande un geste dans la vue `portal.*` (ADR-026) |
| ❌ Importer un SDK d'hébergeur dans un module | → `src/lib/storage` ou `src/lib/mail`, derrière une interface (ADR-021) |
| ❌ `UNIQUE` sur l'e-mail d'un contact client | → un contact couvre plusieurs clients et plusieurs organisations (ADR-023) |
| ❌ Une route en Edge Runtime | → Node.js uniquement, sinon la portabilité est perdue (ADR-021) |
| ❌ Un `loading.tsx` au-dessus d'une page qui peut faire `notFound()` | → la coquille part avant le rendu : `notFound()` répond **200**, et une écriture sur deux n'apparaît pas. `<Suspense>` **dans** la page (ADR-033) |
| ❌ Un `id` en dur dans un composant réutilisable | → deux instances sur la même page et `aria-labelledby` pointe vers la mauvaise (ADR-034) |
| ❌ Croire le `Content-Type` ou l'extension d'un fichier téléversé | → lire la signature des octets ; **jamais de SVG** servi en ligne (ADR-037) |
| ❌ Ajouter une colonne dans une migration écrite à la main sans la déclarer en TypeScript | → invisible pour les requêtes, recréée au prochain `db:generate` ; un test compare les deux (ADR-036) |
| ❌ Une page qui charge des options que son lecteur n'a pas le droit de lire | → appeler `can()` **avant** la lecture ; sinon l'écran échoue en 404 pour le rôle le plus restreint (ADR-038) |
| ❌ Lire `page.url()` juste après un `click()` dans un test E2E | → l'URL est encore celle de la page précédente, et l'assertion ne vérifie plus rien |
| ❌ `event.currentTarget` après un `await` | → il vaut `null` ; capturer l'élément **avant** (ADR-045) |
| ❌ `Promise.all` de plusieurs requêtes sur le même `db` | → une transaction = une connexion = une requête à la fois (ADR-044) |
| ❌ Un `catch` qui enveloppe plus que l'appel réseau | → il attribue à l'écriture des erreurs qui ne sont pas les siennes |
| ❌ Une permission `*_own` sans règle de ligne | → c'est `*_any` avec un nom rassurant ; `policy.ts` (ADR-043) |
| ❌ Un composant client qui importe le barrel d'un module | → importer `mutations.ts` ou `service.ts` (ADR-030) |
| ❌ Membre `INHERIT` de `app_user` et `app_portal` | → `NOINHERIT`, sinon union des politiques RLS (ADR-029) |
| ❌ Une page qui appelle `requireSession()` directement | → `requirePageSession(locale)` : layout et page rendent en parallèle |
| ❌ Un fichier de test jetable à la racine du projet | → il casse `next build`, qui typecheck tout le dépôt |
| ❌ `getByRole('alert')` nu dans un test E2E | → Next ajoute son propre annonceur de route ; scoper via `formAlert()` |
| ❌ `text-success` / `text-danger` / `text-warning` | → les sœurs `-text`, sinon le contraste échoue (ADR-032) |
| ❌ Un scan `axe` sans vérifier quelle page est rendue | → il passe sur un 404 ; assertion du titre exact d'abord |
| ❌ Une page `dev` gardée par `NODE_ENV` seul | → elle est pré-rendue au build ; utiliser `devPagesEnabled()` + `force-dynamic` |
| ❌ Une entrée de menu vers une route inexistante | → `planned: true` dans `NAV_ENTRIES`, retiré par le lot qui la crée |
| ❌ Commencer l'IA, les intégrations ou le suivi du temps | → **V2** (ADR-018) |

---

## 14. Ce qui est explicitement hors périmètre du MVP

IA / Ask Doomee · recommandations automatiques · détection prédictive · moteur d'automatisations configurable ·
gestion de ressources · suivi du temps (timer) · budgets & rentabilité · intégrations externes ·
synchronisation calendrier · Slack/WhatsApp · export Excel/CSV · chat temps réel · traduction du contenu utilisateur ·
sous-tâches, dépendances, Gantt · paiement en ligne · SSO/SAML · application native.

**Si une demande relève de cette liste : le signaler, ne pas l'implémenter sans validation explicite.**

---

## 14 bis. Décisions du commanditaire — tranchées le 2026-09-14

| Sujet | Décision | Détail |
|---|---|---|
| **Résidence des données** | **Union Européenne** au MVP, architecture **portable** sans dépendance fournisseur ni région (Afrique de l'Ouest possible plus tard) | ADR-021 |
| **Volumétrie 12 mois** | 100 organisations · 1 000 projets · 100 000 actions · centaines de milliers de résultats et d'événements ; évolutif sans refonte | ADR-022 |
| **Contact client multi-comptes** | **Oui** — plusieurs comptes clients **et** plusieurs organisations (groupes, holdings), prévu dès le modèle | ADR-023 |
| **Multi-devise** | Stockage et affichage seuls ; **pas de conversion** au MVP, architecture prête pour l'ajouter | ADR-024 |
| **Health Score côté client** | **Non** — outil interne ; un indicateur simplifié distinct pourra être exposé plus tard | ADR-025 |
| **Modèle de rôles** | **6 rôles validés** : `platform_admin` (plateforme) · `owner` · `direction` · `manager` · `collaborator` · `client`. **`owner` est un rôle d'organisation et ne remplace pas le Super Admin** | ADR-012 |

Restent ouvertes, à traiter dans leur lot : **O4** (export Excel/CSV) · **O6** (gamification) ·
**O8** (rétention après résiliation) · **O9** (commentaire client sur une action). Voir `docs/decisions.md`.
Aucune ne bloque le LOT 1.

---

## 15. Rituel de fin de session

1. Mettre à jour le §2 (phase, dernier jalon).
2. Consigner tout nouvel arbitrage dans `docs/decisions.md` (nouvel ADR).
3. Mettre à jour `docs/database.md` si le schéma a bougé.
4. Vérifier que `pnpm verify` est vert.
5. Commiter sur `claude/laughing-keller-gd9tu8` avec un message explicite.
