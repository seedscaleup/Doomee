# Doomee — Journal des décisions techniques (ADR)

> Chaque décision structurante est consignée ici : contexte, options, choix, conséquences.
> **Une décision n'est jamais supprimée** : elle est marquée `Remplacée par ADR-xxx`.
> Statuts : `Proposée` · `Acceptée` · `Remplacée` · `Rejetée`.

| # | Décision | Statut |
|---|---|---|
| [ADR-001](#adr-001) | Monolithe modulaire Next.js | Proposée |
| [ADR-002](#adr-002) | Drizzle ORM plutôt que Prisma | Proposée |
| [ADR-003](#adr-003) | Better Auth auto-hébergé | Proposée |
| [ADR-004](#adr-004) | Multi-tenant : table partagée + RLS | Proposée |
| [ADR-005](#adr-005) | Deux rôles PostgreSQL (interne / portail) | Proposée |
| [ADR-006](#adr-006) | Server Actions plutôt que tRPC/GraphQL | Proposée |
| [ADR-007](#adr-007) | pg-boss pour les jobs | Proposée |
| [ADR-008](#adr-008) | Formulaires de résultats pilotés par la base | Proposée |
| [ADR-009](#adr-009) | Métriques normalisées, pas de JSONB libre | Proposée |
| [ADR-010](#adr-010) | Enums pour les états, tables pour les taxonomies | Proposée |
| [ADR-011](#adr-011) | Trois langues indépendantes | Proposée |
| [ADR-012](#adr-012) | Ajout du rôle `owner` | Proposée |
| [ADR-013](#adr-013) | Compteurs dénormalisés | Proposée |
| [ADR-014](#adr-014) | Rapports figés par snapshot | Proposée |
| [ADR-015](#adr-015) | `@react-pdf/renderer` plutôt qu'un navigateur headless | Proposée |
| [ADR-016](#adr-016) | Relations polymorphes pour commentaires et pièces jointes | Proposée |
| [ADR-017](#adr-017) | `is_client_visible` en opt-in | Proposée |
| [ADR-018](#adr-018) | IA reportée en V2 | Proposée |
| [ADR-019](#adr-019) | Pas de traduction du contenu utilisateur au MVP | Proposée |
| [ADR-020](#adr-020) | Recherche PostgreSQL native | Proposée |

---

<a id="adr-001"></a>
## ADR-001 — Monolithe modulaire Next.js
**Statut** : Proposée · 2026-09-14

**Contexte** — Doomee comporte trois surfaces (application interne, portail client, liens publics), un back-office
et des traitements asynchrones. L'équipe est petite ; la vitesse de livraison prime.

**Options**
1. Monolithe modulaire Next.js.
2. Front Next.js + API séparée (NestJS).
3. Microservices par domaine.

**Décision** — Option 1, avec des frontières de modules **vérifiées automatiquement** (règles de dépendance en CI).

**Pourquoi** — Une seule base de code, un seul typage de bout en bout, un seul déploiement. Les trois surfaces
partagent 80 % du domaine ; les séparer créerait de la duplication de règles de sécurité — le pire endroit où dupliquer.

**Conséquences** — ✅ Vitesse, typage partagé, une seule frontière de sécurité. ❌ Couplage de déploiement ;
discipline nécessaire sur les frontières de modules (d'où la vérification en CI). Les workers de jobs tournent
**hors** serverless, sur un processus Node dédié.

---

<a id="adr-002"></a>
## ADR-002 — Drizzle ORM plutôt que Prisma
**Statut** : Proposée

**Contexte** — La sécurité du produit repose sur RLS PostgreSQL, et les modules Results / dashboards exigent
des requêtes analytiques (agrégats, fenêtres, vues matérialisées).

**Options**
1. **Drizzle ORM**.
2. Prisma.
3. Kysely + SQL à la main.

**Décision** — Drizzle.

**Pourquoi**
- RLS impose `SET LOCAL` **à l'intérieur d'une transaction**. Drizzle expose des transactions légères et du SQL brut typé ; avec Prisma il faut envelopper chaque requête dans une transaction interactive, ce qui coûte cher et se contourne facilement par inadvertance.
- Les clés étrangères **composites** `(organization_id, parent_id)` — pilier de notre isolation — sont naturelles en Drizzle, laborieuses en Prisma.
- Le SQL analytique s'écrit sans s'échapper de l'ORM.
- Les migrations sont du SQL lisible, relisible et amendable (les politiques RLS s'y ajoutent à la main).

**Contre-arguments assumés** — Prisma a une meilleure ergonomie de schéma et un écosystème plus large.
Drizzle demande de connaître SQL : ici c'est un avantage, l'équipe doit comprendre ce que fait sa base.

**Conséquences** — ✅ Contrôle total, RLS naturelle, requêtes rapides. ❌ Plus de SQL à écrire ; `drizzle-kit`
moins mature que `prisma migrate` → les migrations sont **relues à la main** avant fusion (déjà une règle du projet).

---

<a id="adr-003"></a>
## ADR-003 — Better Auth auto-hébergé
**Statut** : Proposée

**Options** — Better Auth · Auth.js v5 · Clerk / WorkOS.

**Décision** — Better Auth, isolé derrière `src/lib/auth`.

**Pourquoi** — Les identités et les sessions restent **dans notre base** : indispensable pour les FK vers `users`,
pour RLS, pour les exigences RGPD et pour une éventuelle contrainte de résidence des données (E8). Better Auth
apporte nativement organisations, invitations, lien magique et 2FA — soit plusieurs semaines de développement.
Clerk facturerait par utilisateur actif alors que **chaque contact client est un utilisateur** : le modèle
économique du portail deviendrait défavorable.

**Conséquences** — ✅ Contrôle, coût, cohérence relationnelle. ❌ Bibliothèque jeune → version épinglée,
mises à jour relues, couche d'isolation maintenue pour rendre un repli vers Auth.js possible en quelques jours.

---

<a id="adr-004"></a>
## ADR-004 — Multi-tenant : table partagée + `organization_id` + RLS
**Statut** : Proposée

**Options** — base par tenant · schéma par tenant · **table partagée + RLS** · filtrage applicatif seul.

**Décision** — Table partagée, `organization_id NOT NULL` partout, RLS `ENABLE` + `FORCE`, clés étrangères composites.

**Pourquoi** — Le filtrage applicatif seul est inacceptable : un seul `where` oublié devient une fuite de données
entre clients concurrents, c'est-à-dire la fin commerciale du produit. RLS déplace la garantie dans la base,
où l'oubli n'est pas possible. Une base par tenant rendrait les migrations et les coûts ingérables.

**Conséquences** — ✅ Isolation garantie par le moteur, migrations uniques, coût linéaire.
❌ Toutes les requêtes doivent passer par `withTenant` ; obligation de tester la présence des politiques
(test généré depuis le schéma, bloquant). Dénormalisation volontaire de `organization_id` sur les tables filles.

---

<a id="adr-005"></a>
## ADR-005 — Deux rôles PostgreSQL : `app_user` et `app_portal`
**Statut** : Proposée

**Contexte** — Exigence forte : « le client doit pouvoir suivre son projet sans avoir accès aux informations internes ».
Le cloisonnement applicatif seul repose sur la vigilance du développeur à chaque requête.

**Décision** — Le portail client utilise un **pool de connexions et un rôle PostgreSQL distincts**, dont les
politiques RLS exigent : bonne organisation **ET** `is_client_visible = true` **ET** projet d'un client autorisé.
Écritures limitées à quatre tables.

**Pourquoi** — C'est la seule conception où un bug du portail **ne peut pas** exposer une note interne :
la base refuse de renvoyer la ligne. Les autres approches reposent sur le fait qu'aucun développeur
n'oubliera jamais un filtre, sur des années de maintenance.

**Conséquences** — ✅ Fuite structurellement impossible, revue simplifiée. ❌ Deux pools à gérer, politiques
supplémentaires à maintenir, requêtes portail légèrement plus coûteuses (sous-requête de portée). Coût accepté.

---

<a id="adr-006"></a>
## ADR-006 — Server Actions + RSC plutôt que tRPC ou GraphQL
**Statut** : Proposée

**Décision** — Lectures par composants serveur, écritures par Server Actions, toutes passant par
`defineQuery` / `defineAction`. Pas de couche API générique. Route Handlers réservés aux webhooks,
téléchargements, exports et tâches planifiées.

**Pourquoi** — Le typage de bout en bout est natif, sans génération de code ni couche de transport.
Moins de JavaScript envoyé au navigateur — décisif pour un portail client consulté sur mobile.
Et surtout : **un seul point d'entrée en écriture**, donc un seul endroit où la sécurité peut être vérifiée.

**Conséquences** — ✅ Simplicité, performance, sécurité centralisée. ❌ Pas d'API publique réutilisable —
acceptable au MVP ; une API REST versionnée sera ajoutée en V3, au-dessus des mêmes services.

---

<a id="adr-007"></a>
## ADR-007 — pg-boss pour les traitements asynchrones
**Statut** : Proposée

**Options** — pg-boss (files dans PostgreSQL) · BullMQ + Redis · Inngest / Trigger.dev.

**Décision** — pg-boss, worker Node dédié hors serverless.

**Pourquoi** — Aucune infrastructure supplémentaire au MVP, et surtout : la mise en file est **transactionnelle
avec la donnée métier**. « Livrable envoyé au client » et « notifier le client » commitent ou échouent ensemble.
Un service externe introduirait une incohérence possible entre les deux.

**Conséquences** — ✅ Une dépendance de moins, atomicité. ❌ Charge supplémentaire sur la base ; à réévaluer
si le volume de jobs dépasse ~50/s. Les jobs sont **idempotents** avec clé d'unicité (R12).

---

<a id="adr-008"></a>
## ADR-008 — Formulaires de résultats pilotés par la base
**Statut** : Proposée

**Contexte** — « Les champs de résultats doivent être adaptés au type d'action » et « ne pas hardcoder les données métier ».

**Décision** — Les formulaires sont décrits dans `result_form_templates` / `result_form_fields`. Le schéma Zod de
validation est **construit à l'exécution** à partir de ces lignes. Six gabarits livrés en seed, extensibles par organisation.

**Pourquoi** — Coder « le formulaire Ads a un champ CPL » enfermerait le produit dans les métiers d'aujourd'hui.
Une agence qui fait de l'événementiel ou du développement doit pouvoir définir ses propres champs sans déploiement.

**Conséquences** — ✅ Extensible sans code, personnalisable par organisation, traduisible.
❌ Les champs de résultats ne sont pas typés statiquement en TypeScript → un moteur de rendu générique
rigoureusement testé, et **les valeurs restent stockées en colonnes typées** (voir ADR-009), pas dans un blob.

---

<a id="adr-009"></a>
## ADR-009 — Métriques normalisées dans `result_metrics`, pas de JSONB libre
**Statut** : Proposée

**Contexte** — Tentation naturelle : stocker les résultats dans un `jsonb` sur `results`.

**Décision** — Chaque valeur quantitative devient une ligne de `result_metrics`, typée `numeric(20,4)`,
rattachée au catalogue `metrics`, avec ses dimensions (projet, client, canal, type d'action, date) dénormalisées.

**Pourquoi** — Le module Results doit filtrer et agréger par client, projet, période, collaborateur, canal et type
d'action, comparer à la période précédente et à l'objectif. En JSONB, ces requêtes seraient lentes, non indexables
proprement et non typées. C'est exactement le piège du modèle EAV (R4) — évité en gardant un **catalogue fermé**
de métriques et des **colonnes typées**.

**Conséquences** — ✅ Requêtes analytiques rapides et indexées, agrégats fiables, objectifs calculés automatiquement.
❌ Plus de lignes, écritures un peu plus complexes (un `INSERT ... SELECT` par résultat).

---

<a id="adr-010"></a>
## ADR-010 — Enums PostgreSQL pour les états, tables de référence pour les taxonomies
**Statut** : Proposée

**Décision**
- Un **état** (statut d'action, statut de livrable, priorité, niveau de risque) est un `enum` PostgreSQL. Non modifiable par l'utilisateur, ses libellés vivent dans les catalogues i18n.
- Une **classification** (type d'action, canal, catégorie, type de livrable, type d'objectif, métrique) est une table de référence avec `labels jsonb`, extensible par organisation.

**Pourquoi** — Les deux ressemblent à des listes déroulantes mais n'ont rien à voir : un état pilote une machine
à états et du code métier (on ne peut pas ajouter « En négociation » sans écrire la logique associée) ;
une classification est une donnée d'organisation. La consigne « ne pas hardcoder les données métier » vise la
seconde catégorie. Confondre les deux produit soit une rigidité inacceptable, soit une machine à états incohérente.

**Conséquences** — ✅ États sûrs et exhaustifs à la compilation, classifications libres. ❌ Ajouter un état
demande une migration — **c'est voulu**.

---

<a id="adr-011"></a>
## ADR-011 — Trois langues indépendantes
**Statut** : Proposée

**Décision** — `users.locale` (interface et notifications) et `users.report_locale` (rapports), ce dernier
surchargeable **par rapport** via `reports.locale`.

**Pourquoi** — Exigence explicite du cahier des charges (§34) : un manager francophone produit un rapport en
anglais pour un client international. Les notifications suivent la langue **du destinataire**, résolue au moment
de l'envoi : deux membres du même projet reçoivent le même événement dans deux langues différentes.

**Conséquences** — ✅ Cas d'usage réel couvert. ❌ Le rendu des rapports et des e-mails ne peut pas dépendre
du contexte de requête → la locale est un **paramètre explicite** de toutes les fonctions de rendu hors écran.
Vérifié par les tests.

---

<a id="adr-012"></a>
## ADR-012 — Ajout du rôle `owner` à côté de `direction`
**Statut** : Proposée

**Contexte** — Le cahier des charges liste 5 rôles et confie la gestion des abonnements au Super Admin.

**Décision** — Ajouter `owner` : propriétaire de l'organisation (facturation, sièges, gestion des rôles, suppression).
`direction` conserve la lecture globale, les objectifs et les risques.

**Pourquoi** — Faire dépendre chaque changement de siège d'un ticket à l'exploitant Doomee ne passe pas l'échelle,
et donner ces droits à tous les membres « Direction » est dangereux. La séparation propriétaire / dirigeant est un
standard SaaS attendu par les clients.

**Conséquences** — ✅ Autonomie du client, moins de support. ❌ Un rôle de plus dans la matrice —
tracé dans l'écart E4, à valider par le commanditaire.

---

<a id="adr-013"></a>
## ADR-013 — Compteurs dénormalisés sur `projects`
**Statut** : Proposée

**Décision** — `progress_percent`, `actions_total`, `actions_done`, `actions_overdue`,
`deliverables_pending_client`, `open_risks_count`, `health_score` sont **stockés** sur `projects`,
mis à jour dans la transaction qui les affecte, et réconciliés par un job nocturne.

**Pourquoi** — Les listes de projets et les quatre dashboards les affichent en permanence. Les recalculer à la
volée impose une agrégation par projet et par ligne — c'est le chemin le plus court vers un dashboard à 4 secondes (R5).

**Conséquences** — ✅ Listes instantanées, tri par santé possible en base. ❌ Risque de dérive →
mise à jour **uniquement** via le service (jamais en SQL direct), job de réconciliation, test d'intégration
comparant valeur stockée et valeur recalculée.

---

<a id="adr-014"></a>
## ADR-014 — Les rapports publiés sont figés par snapshot
**Statut** : Proposée

**Décision** — À la publication, les données du rapport sont figées dans `reports.snapshot` et
`report_sections.data`. La consultation, l'export PDF et le lien partagé lisent **le snapshot**, jamais les tables vivantes.

**Pourquoi** — Un rapport est un document daté, envoyé à un client. S'il changeait après coup parce qu'une action
a été modifiée, le PDF envoyé et l'écran consulté diffèreraient — problème de confiance, voire contractuel.
C'est aussi ce qui rend la page `/share/[token]` sûre : elle ne touche aucune donnée vivante.

**Conséquences** — ✅ Immuabilité, sécurité du partage, export reproductible. ❌ Stockage JSONB supplémentaire ;
corriger un rapport publié impose d'en créer une nouvelle version (comportement explicite dans l'interface).

---

<a id="adr-015"></a>
## ADR-015 — `@react-pdf/renderer` plutôt qu'un navigateur headless
**Statut** : Proposée

**Options** — `@react-pdf/renderer` · Puppeteer/Playwright + HTML · service tiers.

**Décision** — `@react-pdf/renderer`, exécuté dans un job.

**Pourquoi** — Un navigateur headless consomme ~300 Mo par rendu, démarre lentement et dépend des polices
du système — fragile en conteneur, coûteux en serverless (R6). `react-pdf` produit un rendu déterministe,
avec polices embarquées, en quelques dizaines de mégaoctets.

**Conséquences** — ✅ Léger, déterministe, FR/EN maîtrisé. ❌ Les gabarits PDF sont écrits séparément des
composants web (pas de réutilisation du CSS) → le vocabulaire visuel PDF est limité à un jeu fixe de blocs,
alimentés par les mêmes fournisseurs de données de section.

---

<a id="adr-016"></a>
## ADR-016 — Relations polymorphes pour commentaires, pièces jointes et activité
**Statut** : Proposée

**Contexte** — Les commentaires et fichiers peuvent se rattacher à 11 types d'entités. Une table de liaison
par type ferait 33 tables.

**Décision** — `(entity_type, entity_id)` avec `entity_type` en **enum PostgreSQL**, plus `project_id` / `client_id`
dénormalisés pour RLS et pour les filtres.

**Pourquoi** — Le compromis classique : on perd l'intégrité référentielle, on gagne un modèle exploitable.
L'enum empêche les valeurs fantaisistes ; les colonnes dénormalisées permettent aux politiques du portail de
statuer **sans jointure polymorphe**, ce qui serait autrement impossible en RLS.

**Conséquences** — ✅ Un modèle unique pour 11 entités, RLS applicable. ❌ Pas de `FOREIGN KEY` → les suppressions
passent obligatoirement par le service, et un job nocturne détecte les orphelins (R8).

---

<a id="adr-017"></a>
## ADR-017 — `is_client_visible` en opt-in, par défaut `false`
**Statut** : Proposée

**Décision** — Toute entité exposable au client porte `is_client_visible boolean NOT NULL DEFAULT false`.
Les commentaires portent `visibility` avec `'internal'` par défaut. Seuls `projects` et `objectives` ont `true`
par défaut (un client est censé voir son projet et ses objectifs).

**Pourquoi** — Le sens du défaut décide de ce qui arrive quand un développeur oublie de réfléchir.
En opt-out, l'oubli publie une note interne à un client. En opt-in, l'oubli produit au pire une information
manquante — visible, corrigeable, sans dommage.

**Conséquences** — ✅ La défaillance va toujours dans le sens sûr. ❌ Les managers doivent marquer explicitement
ce qu'ils partagent → action groupée « tout partager » au niveau du projet pour limiter la friction.

---

<a id="adr-018"></a>
## ADR-018 — L'IA est reportée en V2
**Statut** : Proposée

**Décision** — Aucune fonctionnalité d'IA au MVP. Les champs qu'elle alimentera plus tard
(résumé exécutif, analyse, insights, recommandations) existent dès le MVP et sont **saisis par des humains**.

**Pourquoi** — Le cahier des charges classe lui-même l'IA en V2 (§31-32). Et c'est la bonne décision : l'IA doit
augmenter une structure de données qui a fait ses preuves. Si le reporting pré-alimenté n'apporte pas déjà de
valeur sans IA, l'IA ne fera que masquer le problème. Les mêmes champs, remplis à la main au MVP, deviendront
les données d'évaluation de la V2.

**Conséquences** — ✅ MVP plus rapide, moins cher, données d'entraînement et d'évaluation constituées.
❌ Argument commercial « IA » indisponible au lancement — compensé par la boucle de valeur, qui est le
vrai différenciateur.

---

<a id="adr-019"></a>
## ADR-019 — Pas de traduction du contenu utilisateur au MVP
**Statut** : Proposée

**Décision** — L'interface, les libellés de taxonomies, les statuts, les notifications et la **structure** des
rapports sont bilingues. Le contenu saisi par les utilisateurs (descriptions, commentaires, analyses,
recommandations) est stocké tel quel, dans sa langue d'origine.

**Pourquoi** — Traduire le contenu utilisateur impose soit une double saisie (contraire à « less typing »),
soit une traduction automatique — inacceptable sans relecture sur une analyse envoyée à un client.

**Conséquences** — ✅ Modèle simple, pas de double saisie. ❌ Un rapport en anglais peut contenir une analyse
écrite en français : l'éditeur de rapport **signale** ce cas au rédacteur avant publication (le rapport reste éditable).
Traduction assistée avec relecture en V2.

---

<a id="adr-020"></a>
## ADR-020 — Recherche PostgreSQL native, pas de moteur externe
**Statut** : Proposée

**Décision** — Colonnes `tsvector` générées par table + index GIN + `unaccent`, requête `UNION ALL` bornée sur
7 entités, filtrée par organisation avant tout.

**Pourquoi** — Pas d'infrastructure supplémentaire, pas de synchronisation d'index (donc pas de dérive), et
l'isolation tenant est assurée par **la même RLS** que le reste. Un moteur externe recréerait tout le modèle de
permissions dans un second système — c'est-à-dire une seconde chance de se tromper.

**Conséquences** — ✅ Sécurité cohérente, zéro dérive, une dépendance de moins. ❌ Pas de recherche floue ni de
pertinence sémantique → `pg_trgm` couvre les fautes de frappe ; réévaluation si le corpus dépasse ~1 M de lignes par organisation.

---

## Décisions ouvertes (à trancher avec le commanditaire)

| # | Sujet | Impact | Bloquant pour |
|---|---|---|---|
| **O1** | **Hébergement et résidence des données** (UE ? Afrique de l'Ouest ?) | Choix de l'hébergeur et de la région | LOT 0 |
| **O2** | Devise par défaut et multi-devise (FCFA / EUR / USD) — conversion attendue ? | Modèle des montants | LOT 6 |
| **O3** | Volumétrie cible à 12 mois (organisations, projets, actions) | Dimensionnement, stratégie d'index | LOT 1 |
| **O4** | Export Excel/CSV reporté en V2 — acceptable ? | Périmètre du LOT 12 | LOT 12 |
| **O5** | Rôle `owner` (ADR-012) — validé ? | Matrice de permissions | LOT 1 |
| **O6** | Gamification : activée par défaut ? désactivable par organisation ? | LOT 14 | LOT 14 |
| **O7** | Un contact client peut-il voir **plusieurs** comptes clients (groupe, holding) ? | Modèle `client_user_access` | LOT 1 |
| **O8** | Rétention des données après résiliation d'un abonnement | RGPD, purge | LOT 15 |
| **O9** | Le client peut-il commenter une **action**, ou seulement un livrable et un rapport ? | Portée du portail | LOT 9 |
| **O10** | Le score de santé doit-il être visible du client ? | Politique de visibilité | LOT 11 |
