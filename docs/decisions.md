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
| [ADR-012](#adr-012) | Ajout du rôle `owner` | **Acceptée** |
| [ADR-013](#adr-013) | Compteurs dénormalisés | Proposée |
| [ADR-014](#adr-014) | Rapports figés par snapshot | Proposée |
| [ADR-015](#adr-015) | `@react-pdf/renderer` plutôt qu'un navigateur headless | Proposée |
| [ADR-016](#adr-016) | Relations polymorphes pour commentaires et pièces jointes | Proposée |
| [ADR-017](#adr-017) | `is_client_visible` en opt-in | Proposée |
| [ADR-018](#adr-018) | IA reportée en V2 | Proposée |
| [ADR-019](#adr-019) | Pas de traduction du contenu utilisateur au MVP | Proposée |
| [ADR-020](#adr-020) | Recherche PostgreSQL native | Proposée |
| [ADR-021](#adr-021) | Résidence UE + portabilité par adaptateurs | **Acceptée** |
| [ADR-022](#adr-022) | Volumétrie cible et seuils de bascule | **Acceptée** |
| [ADR-023](#adr-023) | Contact client multi-comptes et multi-organisations | **Acceptée** |
| [ADR-024](#adr-024) | Multi-devise sans conversion au MVP | **Acceptée** |
| [ADR-025](#adr-025) | Le Project Health Score reste interne | **Acceptée** |
| [ADR-026](#adr-026) | Vues `portal.*` pour l'isolation au niveau colonne | Proposée |
| [ADR-027](#adr-027) | scrypt plutôt qu'Argon2id pour les mots de passe | Proposée |
| [ADR-028](#adr-028) | `users` : lignes globales, visibilité par organisation | **Acceptée** |
| [ADR-029](#adr-029) | Rôles PG par groupe + `SET LOCAL ROLE` `NOINHERIT` | **Acceptée** |
| [ADR-030](#adr-030) | Barrels de module côté serveur uniquement | Proposée |
| [ADR-031](#adr-031) | `<dialog>` natif plutôt qu'une bibliothèque de modales | Proposée |
| [ADR-032](#adr-032) | Couleurs de marque en aplat, variantes `-text` accessibles | **Acceptée** |
| [ADR-033](#adr-033) | Pas de `loading.tsx` au-dessus d'une page qui peut faire 404 | **Acceptée** |
| [ADR-034](#adr-034) | Une modale nomme son titre avec un identifiant unique | **Acceptée** |
| [ADR-035](#adr-035) | Une invitation de contact client porte le compte qu'elle ouvre | **Acceptée** |
| [ADR-036](#adr-036) | Schéma TypeScript et base migrée comparés par un test | **Acceptée** |
| [ADR-037](#adr-037) | Port de stockage : filesystem et S3, mêmes tests | **Acceptée** |
| [ADR-038](#adr-038) | Portée collaborateur : une clause, écrite une fois | **Acceptée** |
| [ADR-039](#adr-039) | Le fuseau horaire appartient au projet | **Acceptée** |
| [ADR-040](#adr-040) | La passerelle distingue entrée brute et entrée validée | **Acceptée** |
| [ADR-041](#adr-041) | Une action bloquée dit pourquoi | **Acceptée** |
| [ADR-042](#adr-042) | Une seule notion d'urgence, dans un service pur | **Acceptée** |
| [ADR-043](#adr-043) | `action.update_own` a besoin d'une règle de ligne | **Acceptée** |
| [ADR-044](#adr-044) | Une transaction, une requête à la fois | **Acceptée** |
| [ADR-045](#adr-045) | `event.currentTarget` ne survit pas à un `await` | **Acceptée** |
| [ADR-046](#adr-046) | Un écart non calculable dit pourquoi | **Acceptée** |
| [ADR-047](#adr-047) | Une métrique porte son agrégation et sa direction | **Acceptée** |
| [ADR-048](#adr-048) | Un objectif est visible du client par défaut | **Acceptée** |
| [ADR-049](#adr-049) | Ce qui dépasse scrolle dans son conteneur, pas la page | **Acceptée** |

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
**Statut** : **Acceptée** · 2026-09-14 · *Tranche la question O5*

**Contexte** — Le cahier des charges liste 5 rôles et confie la gestion des abonnements au Super Admin.

**Décision** — Ajouter `owner` : propriétaire de l'organisation (facturation, sièges, gestion des rôles, suppression).
`direction` conserve la lecture globale, les objectifs et les risques.

**Pourquoi** — Faire dépendre chaque changement de siège d'un ticket à l'exploitant Doomee ne passe pas l'échelle,
et donner ces droits à tous les membres « Direction » est dangereux. La séparation propriétaire / dirigeant est un
standard SaaS attendu par les clients.

**Conséquences** — ✅ Autonomie du client, moins de support. ❌ Un rôle de plus dans la matrice.

### Modèle de rôles arrêté (2026-09-14)

| # | Rôle | Portée | Ce qui le définit |
|---|---|---|---|
| 1 | **Super Admin** (`platform_admin`) | **La plateforme Doomee**, hors organisation | Administration globale ; l'accès aux données d'une organisation suit les permissions de plateforme et est **systématiquement journalisé** dans `audit_logs` |
| 2 | **Owner** | **Une** organisation | Propriétaire : membres et utilisateurs, sièges, paramètres de l'organisation, et la facturation / l'abonnement lorsqu'ils seront implémentés. **Aucun accès aux autres organisations** |
| 3 | **Direction** | Son organisation | Vue globale : projets, résultats, rapports, clients, équipes, selon les permissions définies |
| 4 | **Manager / Project Manager** | Les projets qui lui sont attribués | Gestion des projets, actions, livrables, résultats et équipes dans son périmètre |
| 5 | **Collaborateur** | Les projets auxquels il participe | Met à jour ses actions et renseigne les résultats |
| 6 | **Client** | Le portail client uniquement | Clients, projets, livrables, résultats et rapports qui lui sont autorisés. **Aucun accès aux notes ni aux informations internes** |

> **Owner ≠ Super Admin.** `owner` est un rôle **d'organisation**, porté par `memberships` et soumis à
> RLS comme tout autre membre. `platform_admin` est un attribut de `users`, hors de toute organisation,
> et ne remplace ni n'absorbe le rôle `owner`. Les deux coexistent et ne se substituent jamais l'un à l'autre.

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

<a id="adr-021"></a>
## ADR-021 — Résidence des données en UE, portabilité par adaptateurs
**Statut** : **Acceptée** · 2026-09-14 · *Tranche la question O1*

**Décision** — Toutes les données résident dans l'Union Européenne pour le MVP. **Et** l'architecture ne
dépend d'aucun fournisseur ni d'aucune région : une bascule vers l'Afrique de l'Ouest doit être une
opération d'exploitation, pas une refonte.

**Ce que cela change concrètement** — cinq contraintes, à respecter dès le LOT 0 :

1. **Conteneur, pas plateforme.** Next.js en mode `standalone`, image Docker. L'application doit démarrer identiquement sur Vercel, Scaleway, OVH, Fly.io ou un Kubernetes.
2. **PostgreSQL standard uniquement.** Aucune extension propriétaire, aucun helper de fournisseur. Notre RLS utilise `current_setting()`, pas `auth.uid()`. Un `pg_dump` suffit à déménager.
3. **Adaptateurs pour tout ce qui touche l'infrastructure.** `StorageAdapter` (S3 générique, endpoint et région configurables) et `MailAdapter` (**SMTP par défaut**, Resend en option). Chacun a **deux implémentations testées** — c'est la seule preuve qu'une abstraction est réellement portable.
4. **Node.js uniquement, jamais l'Edge Runtime.** Le middleware reste minimal et compatible Node.
5. **Aucun SDK d'hébergeur dans `src/modules/`.** Les seuls points de contact avec l'infrastructure sont `src/lib/storage` et `src/lib/mail`. Vérifié par une règle de dépendance en CI.

**Pourquoi c'est une contrainte d'architecture et pas d'exploitation** — la portabilité ne s'ajoute pas
après coup. Un `put()` de R2 appelé depuis un module, un `auth.uid()` dans une politique RLS, une route
en Edge Runtime : chacun coûte des semaines à défaire. Le coût de les éviter au LOT 0 est d'environ deux jours.

**Conséquences** — ✅ Le choix de l'hébergeur devient réversible et peut être arrêté juste avant le LOT 15.
❌ On renonce aux commodités propriétaires (branches de base par PR façon Neon, files de messages intégrées) :
les bases de prévisualisation sont créées par script depuis un `pg_dump`, les files sont dans PostgreSQL (ADR-007).

---

<a id="adr-022"></a>
## ADR-022 — Volumétrie cible à 12 mois et seuils de bascule
**Statut** : **Acceptée** · *Tranche la question O3*

**Décision** — Dimensionner pour ~100 organisations · ~1 000 projets · ~100 000 actions ·
plusieurs centaines de milliers de résultats et d'événements, **sans** optimisation prématurée,
et en identifiant à l'avance les seuils où l'architecture devra évoluer.

**Pourquoi cela simplifie le MVP** — 100 000 actions sur une instance PostgreSQL correctement indexée,
c'est confortable. Donc : **pas de partitionnement, pas de réplique de lecture, pas de Redis, pas de
moteur de recherche externe** au MVP. Chacun de ces choix aurait ajouté de l'infrastructure et des
modes de défaillance pour un problème qui n'existe pas encore.

**Les cinq dispositions prises quand même**, parce qu'elles coûtent cher à ajouter après coup :
`organization_id` partout et en tête des index · pagination par curseur · `activity_events` et
`result_metrics` conçues en append-only (partitionnables plus tard sans réécriture) ·
compteurs dénormalisés (ADR-013) · vue matérialisée prévue dès le LOT 7.

**Seuils et réponses** — détaillés dans `docs/architecture.md` §9.0. Aucun ne demande de refonte :
`activity_events` > 5 M → partitionnement mensuel · > 500 organisations → réplique de lecture ·
> 50 jobs/s → BullMQ (ADR-007) · organisation « géante » → extraction vers une base dédiée,
possible précisément parce que `organization_id` est déjà partout.

**Conséquences** — ✅ MVP simple, chemin de croissance connu. ❌ Un test de charge du LOT 15 devra
confirmer ces hypothèses sur des données réalistes (50 organisations × 20 projets × 500 actions).

---

<a id="adr-023"></a>
## ADR-023 — Un contact client peut couvrir plusieurs comptes clients et plusieurs organisations
**Statut** : **Acceptée** · *Tranche la question O7*

**Contexte** — Groupes et holdings : la même personne suit plusieurs filiales, parfois chez plusieurs
agences utilisatrices de Doomee.

**Décision** — Une personne = **un seul** enregistrement `users`. Le rôle est porté par `memberships`
(un par organisation), la portée par `client_user_access` (n lignes par organisation).
`app.client_ids` est une **liste**, jamais une valeur unique. Le portail reçoit un sélecteur d'organisation.

**Pourquoi un seul compte** — dupliquer l'utilisateur par client donnerait autant de mots de passe et de
préférences de langue que de filiales, et rendrait les notifications incohérentes. Le cahier des charges
exige une langue **par utilisateur** : il faut donc que l'utilisateur soit unique.

**Le risque, et sa mitigation** — un contact appartenant aux organisations A et B ne doit jamais voir A
depuis B. `app.client_ids` est recalculé à chaque changement d'organisation et ne contient **que** les
clients de l'organisation active. Un test d'intégration dédié couvre exactement ce scénario.

**Conséquences** — ✅ Un compte, une identité, cas des groupes couvert nativement.
❌ L'unicité de `client_contacts` porte sur `(organization_id, client_id, email)` et **jamais** sur
l'e-mail seul ; le parcours d'invitation doit reconnaître un utilisateur existant plutôt que d'échouer.

---

<a id="adr-024"></a>
## ADR-024 — Multi-devise : stockage et affichage, pas de conversion
**Statut** : **Acceptée** · *Tranche la question O2*

**Décision** — Tout montant est un **couple** `numeric(18,2)` + `char(3)` ISO-4217. Affichage via
`Intl.NumberFormat`. **Aucune conversion, aucun taux de change au MVP.**

**La règle qui compte** — **ne jamais sommer deux devises.** Tout agrégat monétaire est `GROUP BY currency`.
Un dashboard affiche « 12 000 000 XOF et 4 200 EUR », jamais un total unique. C'est moins élégant, mais
un total faux dans un rapport envoyé à un client est un incident, pas un défaut d'esthétique.
Un objectif et ses résultats dans des devises différentes ne produisent **pas** d'écart : l'interface le signale.

**Pourquoi reporter la conversion** — une conversion correcte exige un taux **daté** et une source
auditable (le taux du jour de la dépense, pas celui du jour de l'affichage). C'est un sujet en soi,
sans valeur au MVP.

**Ce qui rend la V2 facile** — chaque montant porte déjà sa devise, donc **aucune donnée historique ne
sera ambiguë**. Il suffira d'ajouter `exchange_rates` et deux colonnes `amount_base` / `rate_used`.
C'est le seul point qui devait être acquis dès maintenant.

**Conséquences** — ✅ Simple, exact, V2 préparée. ❌ Pas de total consolidé multi-devises : assumé et explicite dans l'interface.

---

<a id="adr-025"></a>
## ADR-025 — Le Project Health Score reste un outil interne
**Statut** : **Acceptée** · *Tranche la question O10*

**Décision** — `health_score` et `health_status` ne sont **jamais** exposés au portail client au MVP.
Le client voit l'avancement (`progress_percent`), les prochaines étapes et ses livrables en attente.

**Pourquoi** — le score agrège des signaux internes : charge d'équipe, actions en retard, validations en
attente. Une partie de ces signaux met en cause le client lui-même (« 1 validation en attente depuis 3 jours »).
L'exposer transformerait un outil de pilotage en objet de négociation, et pousserait les managers à
manipuler le score plutôt qu'à s'en servir. Un indicateur devient politique dès qu'il est vu par la partie évaluée.

**Mise en œuvre** — ce n'est pas un `if` dans l'interface : les colonnes sont **absentes des vues
`portal.*`** (ADR-026). Elles ne peuvent pas fuiter, même par une erreur de sérialisation.

**Évolution possible** — un indicateur **simplifié et distinct** (`on_track` / `needs_attention`), calculé
sur les seuls facteurs que le client peut comprendre et influencer, pourra être exposé plus tard.
Ce sera une **nouvelle colonne**, pas une exposition de celle-ci.

**Conséquences** — ✅ Le score reste un outil de travail honnête. ❌ Le client ne dispose pas d'un signal
de risque synthétique — compensé par les prochaines étapes et les livrables en attente, qui sont actionnables.

---

<a id="adr-026"></a>
## ADR-026 — Vues `portal.*` : isolation au niveau colonne
**Statut** : **Accepté** — mis en œuvre au LOT 9, précisé par ADR-061

**Contexte** — RLS filtre des **lignes**. Or ADR-025 (santé), le budget, le temps passé et les compteurs
de retard sont des **colonnes** de tables dont le client doit voir certaines lignes.

**Options**
1. Filtrer les colonnes dans la couche de requête du portail (liste blanche applicative).
2. Politiques par colonne — **n'existe pas** en PostgreSQL (seuls les `GRANT` par colonne existent, ingérables ici).
3. **Vues dédiées `portal.*`** avec `security_invoker = true`, et révocation de tout droit de `app_portal` sur `public`.

**Décision** — Option 3.

**Pourquoi** — l'option 1 repose sur le fait qu'aucun développeur n'oubliera jamais une colonne, sur des
années. L'option 3 inverse le défaut : ajouter une colonne à une table n'en fait **jamais** une colonne
visible du client ; il faut un geste explicite dans la vue. `security_invoker = true` (PostgreSQL 15+)
fait appliquer RLS avec les droits de `app_portal` : la vue **cumule** les deux barrières au lieu de les contourner.

**Conséquences** — ✅ Fuite de colonne structurellement impossible ; revue simplifiée (la vue est la
spécification de ce que voit le client). ❌ Une quinzaine de vues à maintenir ; ajouter un champ au
portail demande une migration — **c'est le but**. Test : `app_portal` n'a aucun droit sur le schéma `public`.

---

<a id="adr-027"></a>
## ADR-027 — scrypt plutôt qu'Argon2id pour le hachage des mots de passe
**Statut** : Proposée · LOT 1

**Contexte** — `docs/architecture.md` §6.1 annonçait Argon2id. À l'implémentation, Argon2id en Node
impose le paquet `argon2`, **module natif** qui doit être compilé.

**Décision** — Utiliser le **scrypt intégré** de Better Auth (implémentation `node:crypto`).

**Pourquoi** — un module natif casse la propriété centrale d'ADR-021 : une image unique, portable,
construite sans chaîne de compilation. Sur `node:22-alpine` il faudrait ajouter `python3`, `make` et
`g++` au stage de build, faire grossir l'image, et accepter qu'une mise à jour de Node puisse casser
le binaire. Le coût est réel et permanent ; le gain est marginal : scrypt est une fonction
**mémoire-dure**, explicitement recommandée par l'OWASP au même titre qu'Argon2id, et ce n'est pas le
facteur limitant de notre modèle de menace (vérification d'e-mail obligatoire, 12 caractères minimum,
limitation de débit sur la connexion, 2FA disponible).

**Conséquences** — ✅ Image légère, aucune compilation, aucune dépendance native.
❌ Marge de résistance au GPU inférieure à Argon2id. Réversible : Better Auth accepte une fonction de
hachage personnalisée, et une migration transparente au prochain login est possible si le besoin change.

---

<a id="adr-028"></a>
## ADR-028 — `users` : lignes globales, visibilité limitée à l'organisation
**Statut** : **Acceptée** · LOT 1 · *Corrige une fuite identifiée en conception*

**Le problème, trouvé pendant le LOT 1** — ADR-023 impose une personne = **un seul** enregistrement
`users`, partagé entre organisations. La table ne peut donc pas porter `organization_id`, et la
documentation en concluait qu'elle n'avait « pas de RLS ». Conséquence non vue à ce moment :
`app_user` pouvait lire **tous les utilisateurs de la plateforme** — nom et e-mail compris.
Une organisation aurait pu extraire l'annuaire du personnel de ses concurrents. C'est bien une fuite
inter-organisations, la classe de risque R1.

**Décision** — `users` reçoit une politique RLS de **visibilité** : une ligne n'est lisible que s'il
existe une adhésion partagée dans l'organisation **courante**.

```sql
CREATE POLICY same_organization_read ON users FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM memberships m
                  WHERE m.user_id = users.id
                    AND m.organization_id = current_setting('app.organization_id', true)::uuid));
REVOKE INSERT, UPDATE, DELETE ON users FROM app_user;
```

**Le seul `ENABLE` sans `FORCE` du schéma** — et c'est délibéré. `FORCE` soumet le propriétaire de la
table aux politiques ; or Better Auth se connecte comme propriétaire et doit retrouver un utilisateur
par e-mail **avant** que la moindre organisation soit connue. `app_user` n'est pas le propriétaire :
la politique le contraint bel et bien. Cette exception unique est commentée dans la migration et
vérifiée par un test dédié.

**Écriture interdite à `app_user`** — le profil se modifie via Better Auth, qui se connecte comme
propriétaire. L'application peut lire un collègue, jamais le réécrire.

**Conséquences** — ✅ L'énumération inter-organisations devient impossible, prouvée par un test
(`tenant-isolation.test.ts`) qui rougit dès que la politique saute. ❌ Toute lecture de `users` doit
se faire dans un contexte tenant : un écran hors organisation (choix de l'organisation à la connexion)
passe par la couche d'authentification, pas par `withTenant`.

---

<a id="adr-029"></a>
## ADR-029 — Rôles de groupe et `SET LOCAL ROLE` plutôt que deux comptes de connexion
**Statut** : **Acceptée** · LOT 1 · *Précise la mise en œuvre d'ADR-005*

**Contexte** — ADR-005 impose deux rôles PostgreSQL distincts pour l'interne et le portail. Restait à
décider comment l'application les endosse.

**Décision** — `app_user` et `app_portal` sont des rôles de **groupe** `NOLOGIN`. L'application se
connecte avec **un seul** rôle de connexion, membre des deux **avec `NOINHERIT`**, et bascule dans l'un
ou l'autre par transaction via `SET LOCAL ROLE`. Les deux pools restent séparés.

**Pourquoi `NOINHERIT` est une exigence de sécurité, pas un détail** — PostgreSQL sélectionne les
politiques RLS avec `has_privs_of_role`. Un membre **`INHERIT`** des deux rôles recevrait donc l'**union**
de leurs politiques : le portail verrait les lignes internes. Avec `NOINHERIT`, le rôle de connexion n'a
aucun privilège tant qu'il n'a pas fait `SET ROLE`. Un test d'intégration dédié le prouve, parce qu'une
propriété aussi subtile ne doit pas reposer sur la mémoire de l'équipe.

**Pourquoi pas deux comptes de connexion** — il faudrait deux mots de passe, deux chaînes de connexion,
deux rotations, et la même garantie. Le coût opérationnel est doublé pour un bénéfice nul :
la barrière tient aux politiques et aux privilèges, pas au nombre de comptes.

**Conséquences** — ✅ Un seul secret à gérer, garantie identique, mise en œuvre testée à l'identique en
local, en CI et en production. ❌ `SET LOCAL ROLE` ajoute un aller-retour par transaction ;
les identifiants sont créés par `src/db/provision.ts`, jamais par une migration.

---

<a id="adr-030"></a>
## ADR-030 — Le `index.ts` d'un module est une entrée **serveur**
**Statut** : Proposée · LOT 1

**Le problème, rencontré au premier écran** — la règle « un module s'importe par son `index.ts` » et la
frontière client/serveur de React se contredisent : un composant client qui importe le barrel tire
`queries.ts`, donc `next/headers`, donc une erreur de build obscure.

**Décision**
- `index.ts` est l'entrée **serveur** : composants serveur, autres modules.
- Un composant **client** importe le fichier précis dont il a besoin : `mutations.ts` (marqué
  `'use server'`, donc une frontière RPC) ou `service.ts` (pur, donc sûr partout).
- Toute surface serveur porte `import 'server-only'`, si bien qu'un import client fautif échoue
  **au build**, avec un message qui nomme le problème.

**Pourquoi** — la convention seule se fait oublier. `server-only` la rend mécanique : on ne peut plus
se tromper en silence, seulement bruyamment et tôt.

**Conséquences** — ✅ Frontière explicite et vérifiée par l'outillage. ❌ Deux styles d'import à
connaître ; documenté dans `CLAUDE.md` §5 et visible dans chaque composant client.

---

<a id="adr-031"></a>
## ADR-031 — `<dialog>` natif plutôt qu'une bibliothèque de modales
**Statut** : Proposée · LOT 2

**Contexte** — Le LOT 2 a besoin de trois surcouches : confirmation, formulaire en feuille, palette de
commandes. `CLAUDE.md` §4 cite shadcn/ui, dont la substance est « posséder ses composants », bâtis sur Radix.

**Décision** — Garder la philosophie shadcn (les composants vivent dans notre dépôt, pas dans une
dépendance) et bâtir les modales sur l'élément **`<dialog>` natif** plutôt que sur Radix Dialog.

**Pourquoi** — `showModal()` fournit gratuitement les quatre choses qu'une modale faite main rate :
piégeage du focus, fermeture par Échap, contenu d'arrière-plan rendu inerte, et placement dans la
couche supérieure. C'est du code en moins, pas en plus. Et c'est du JavaScript en moins dans le
bundle, ce qui compte directement pour la contrainte mobile et pour le budget du portail client.

Nous n'avons pas non plus lancé le CLI shadcn : il génère son propre jeu de variables CSS
(`--background`, `--primary`…) qui entrerait en collision avec la palette Doomee. Reprendre ses
composants en les écrivant sur nos jetons donne le même résultat sans le conflit.

**Conséquences** — ✅ Accessibilité native, zéro dépendance, bundle plus léger.
❌ Pas de primitive toute faite pour les cas que `<dialog>` ne couvre pas (combobox, menu riche) :
Radix reste disponible et sera ajouté **au composant qui en aura besoin**, pas par anticipation.

---

<a id="adr-032"></a>
## ADR-032 — Couleurs de marque pour les aplats, variantes `-text` pour le texte
**Statut** : **Acceptée** · LOT 2 · *Corrige une violation de contraste réelle*

**Le problème, trouvé par le scan axe du LOT 2** — les couleurs sémantiques du cahier des charges
passent le seuil de **3:1** exigé d'un aplat, d'une bordure ou d'un point, mais **pas** le **4,5:1**
exigé d'un texte :

| Jeton | Contraste sur le fond | Verdict en texte |
|---|---|---|
| `--color-success` `#22A06B` | 3,18 | ❌ |
| `--color-danger` `#E5484D` | 3,74 | ❌ |
| `--color-warning` `#F59E0B` | **2,05** | ❌ |
| `--color-info` `#3B82F6` | 3,52 | ❌ |
| `--color-subtle` `#93938C` | 2,96 | ❌ |

**Décision** — **Les couleurs de marque ne changent pas.** Elles appartiennent à l'identité du
commanditaire. Chacune reçoit une sœur `-text` assombrie, utilisée dès que la couleur porte du texte :
`success-text #177552` · `danger-text #C0272C` · `warning-text #B45309` · `info-text #2563EB`.
`--color-subtle` passe à `#6D6D66` et `--color-border-strong` à `#9C9C93`.

Le bouton destructif utilise `danger-text` en fond : blanc sur `#E5484D` ne donne que 3,91:1.

**L'exception assumée : le jaune et l'orange**
- `#FFD21F` est illisible sous du texte blanc (1,45:1) et excellent sous du noir (13:1). D'où la règle
  « texte sur jaune toujours `#111111` », désormais vérifiée par un test.
- `#F59E0B` reste sous 3:1 même en aplat. On ne change pas la marque : la règle est que la couleur
  d'avertissement **n'est jamais le seul porteur de sens** — un point est toujours accompagné de son
  libellé, un badge a toujours du texte et une bordure. C'est WCAG 1.4.1, qui s'applique de toute façon.

**Ce qui empêche la régression** — `tests/unit/contrast.test.ts` lit les valeurs **dans `globals.css`**
et vérifie chaque paire. Un jeton éclairci de deux crans paraît correct à qui le change et devient
illisible pour tout le monde ; seul un test attrape ça.

---

<a id="adr-033"></a>
## ADR-033 — Pas de `loading.tsx` au-dessus d'une page qui peut répondre 404

**Statut** : Accepté · **Date** : 2026-09-14 · **Lot** : 3

**Contexte.** Le groupe de routes `(app)` portait un `loading.tsx` : un squelette
affiché pendant le rendu de n'importe quel écran interne. C'était l'application du
principe UX « Show progress » au niveau du routeur.

Deux défauts **mesurés** en fin de LOT 3, tous deux causés par ce seul fichier :

1. **Une écriture sur deux n'était pas visible.** Après création d'un client, la
   liste continuait d'afficher l'état vide. La donnée était bien écrite — un
   rechargement complet de la page la montrait — mais l'arbre rafraîchi n'était
   pas appliqué. Reproduit 10 fois : 4 à 6 échecs ; le fichier retiré : 10/10.
2. **`notFound()` répondait 200.** Un `loading.tsx` crée une frontière Suspense :
   Next diffuse la coquille de la page *avant* que le rendu ne se termine, donc
   le statut HTTP est déjà parti quand `notFound()` s'exécute. Un client atteignant
   l'URL interne d'une autre organisation recevait bien la page 404, mais avec un
   code 200 — ce qui contredit la règle « 404, jamais 403 » à l'endroit où elle se
   vérifie : le statut.

**Décision.** Aucun `loading.tsx` au niveau d'un segment de route qui contient des
pages capables de répondre `notFound()` — c'est-à-dire, en pratique, aucun dans
`(app)`.

L'attente se montre **à l'intérieur de la page**, avec un `<Suspense>` autour de la
section réellement lente (un tableau de bord, un graphique), une fois la coquille
rendue et le statut HTTP déjà décidé. `SkeletonList` reste le repli prévu pour ces
frontières ; il est exercé dans la galerie de composants pour ne pas dériver.

**Conséquences.**
- Le principe « Show progress » n'est pas abandonné, il est déplacé là où il ne
  coûte ni la fraîcheur d'une écriture ni un code de statut.
- Les tests `tests/e2e/clients.spec.ts` (« one organisation never sees another
  organisation clients » et « refuses a client id that does not exist ») vérifient
  le statut `404` lui-même, pas seulement le contenu de la page : c'est ce qui
  empêche la régression.
- Une alternative examinée et écartée : appeler `revalidatePath()` dans
  `defineAction`. Mesurée, elle ne corrigeait pas le défaut 1 (la frontière
  Suspense en était la cause, pas le mécanisme de rafraîchissement) et n'aurait
  rien fait pour le défaut 2. Ajouter un mécanisme qui ne répare rien aurait
  seulement masqué la cause.

---

<a id="adr-034"></a>
## ADR-034 — Une modale nomme son titre avec un identifiant unique

**Statut** : Accepté · **Date** : 2026-09-14 · **Lot** : 3

**Contexte.** `Modal` écrivait `aria-labelledby="modal-title"` en dur. Dès qu'une
page monte plusieurs modales — une fiche d'édition, une confirmation, la palette de
commandes, ce qui est déjà le cas de la fiche client — toutes pointaient vers le
**premier** `#modal-title` du document. Les trois dialogues s'annonçaient donc sous
le même nom, celui d'une modale sans rapport.

**Décision.** `useId()` pour le titre et pour la description. Chaque instance porte
ses propres identifiants.

**Conséquences.** Le nom accessible d'un dialogue redevient son titre, ce qui rend
`getByRole('dialog', { name })` utilisable — les tests s'en servent pour distinguer
deux boutons « Archiver », celui qui ouvre la confirmation et celui qui la valide.
Un identifiant en dur dans un composant réutilisable est désormais à traiter comme
un bug d'accessibilité, pas comme un détail.

---

<a id="adr-035"></a>
## ADR-035 — Une invitation de contact client porte le compte qu'elle ouvre

**Statut** : Accepté · **Date** : 2026-09-14 · **Lot** : 3

**Contexte.** Inviter un collègue et inviter un contact client se ressemblent —
un jeton, un e-mail, une acceptation — mais ce qu'ils accordent n'a rien à voir.
Un collègue rejoint une organisation ; un contact client reçoit une fenêtre sur
**un** compte client, et sur celui-là seulement.

ADR-023 ajoute la contrainte qui casse les modèles naïfs : la même personne suit
légitimement plusieurs comptes clients, et plusieurs organisations. Un `client_id`
posé sur `users`, ou un `UNIQUE` sur l'e-mail, rendraient le cas des groupes et
des holdings impossible à représenter.

**Décision.** `invitations.client_id` porte la portée. À l'acceptation :
- une ligne `memberships` de rôle `client` **par organisation** (créée si absente) ;
- une ligne `client_user_access` **par compte client**, en `ON CONFLICT DO NOTHING` ;
- `client_contacts.user_id` renseigné pour le compte concerné.

La résolution pré-tenant (`invitationByHash`) refuse trois appariements qui n'ont
pas de sens, plutôt que de les interpréter :

| Jeton | Décision |
|---|---|
| rôle `client` **sans** `client_id` | refusé — un rôle portail sans portée |
| rôle interne **avec** `client_id` | refusé — la seule raison d'écrire ça est d'en abuser |
| rôle `owner` | refusé — `owner` ne se distribue pas par invitation |

**Ce qui reste fermé.** Un contact client qui atteint l'espace interne reçoit
**404**. Le garde est dans le layout `(app)`, pas dans le middleware (D1), et il
**filtre** au lieu de rejeter : la même personne peut être interne dans son agence
et contact client ailleurs, donc le sélecteur d'organisation ne propose que les
organisations où elle est interne. Vérifié de bout en bout : le contact accepte,
son accès existe, et `/fr/app` répond 404.

**Conséquences.** Le portail lui-même (rôle `app_portal`, vues `portal.*`) reste
au LOT 9 : ce lot livre l'**accès**, pas encore l'écran. Après acceptation, le
contact voit une confirmation plutôt qu'une redirection vers une porte qui n'est
pas la sienne.

---

<a id="adr-036"></a>
## ADR-036 — Le schéma TypeScript et la base migrée sont comparés par un test

**Statut** : Accepté · **Date** : 2026-09-14 · **Lot** : 3

**Contexte.** Les migrations sont générées par drizzle-kit **puis relues et
complétées à la main** — les politiques RLS, et parfois une colonne qui ne peut
pas être déclarée en TypeScript sans créer un cycle d'imports. C'est assumé
(CLAUDE.md §7), et c'est exactement par là que les deux se désynchronisent.

C'est arrivé : `invitations.client_id` a été ajoutée dans la migration 0007 — où
elle devait être, puisqu'elle référence `clients` — mais jamais déclarée dans
`tenancy.ts`. Rien n'a échoué. La colonne était invisible pour toutes les
requêtes, et le prochain `pnpm db:generate` aurait proposé de la créer une
seconde fois.

**Décision.** `tests/integration/schema-drift.test.ts` compare, sur une base
réellement migrée, les colonnes déclarées dans `src/db/schema` et celles présentes
dans `information_schema`. Dans les deux sens : déclarée et absente, présente et
non déclarée.

Le test est **généré depuis le schéma**, donc une table ajoutée demain est couverte
le jour où elle existe — comme les suites d'isolation et de couverture RLS.

**Conséquences.** Une contrainte qu'un cycle d'imports empêche de déclarer en
TypeScript reste écrite à la main dans la migration ; ce que le test exige, c'est
que la **colonne**, elle, soit déclarée. L'instantané drizzle correspondant est
mis à jour en conséquence, pour que `pnpm db:generate` reste silencieux tant que
le schéma n'a pas bougé.

---

<a id="adr-037"></a>
## ADR-037 — Le port de stockage, et ses deux implémentations réelles

**Statut** : Accepté · **Date** : 2026-09-14 · **Lot** : 3

**Contexte.** ADR-021 exige que le choix de l'hébergeur reste réversible, et que
tout SDK d'infrastructure vive derrière une interface, dans `src/lib/storage` ou
`src/lib/mail`, **avec deux implémentations testées** — parce qu'une abstraction
qui n'a qu'une implémentation n'est qu'une hypothèse sur la portabilité.

**Décision.** `StorageAdapter` expose quatre opérations : `put`, `get`,
`signedUrl`, `remove`. Deux implémentations :

| | Objets | URL signée |
|---|---|---|
| `filesystem` *(défaut)* | disque local | `/api/storage/<clé>?expires=…&signature=…`, HMAC-SHA256 sur `clé:expiration` |
| `s3` | n'importe quel bucket compatible S3 | URL pré-signée du bucket |

Les deux passent **le même fichier de tests**, `tests/integration/storage-adapters.test.ts`,
S3 compris — contre un vrai MinIO en conteneur, en suivant réellement le lien
signé et en vérifiant qu'il répond 403 une fois expiré. L'adaptateur filesystem
n'est donc pas un bouchon : c'est la seconde implémentation, et c'est celle que
les suites E2E utilisent.

**Ce que le lien signé garantit (R13).**
- Cinq minutes au maximum, `MAX_SIGNED_URL_TTL_SECONDS`.
- Émis **après** le contrôle de permission, dans la transaction locataire qui a
  prouvé que la ligne nous appartient. La clé de stockage elle-même ne quitte
  jamais le serveur : opaque ou non, une clé distribuée reste une clé.
- La signature couvre **la clé et l'expiration**. Reportée sur une autre clé, ou
  avec une expiration repoussée à la main, elle est refusée — et refusée en
  **404**, pour ne pas confirmer ce qui existe. Vérifié de bout en bout.

**Le type d'un fichier est lu, pas cru.** L'extension et le `Content-Type` sont
des affirmations de celui qui téléverse. `detectImageType` lit la signature des
premiers octets et ne répond que PNG, JPEG, WebP — ou rien. **SVG est absent et
le reste** : c'est un document qui peut porter du script, et le servir en ligne
depuis notre origine serait une XSS stockée. Corollaire côté service : seuls ces
trois types sont servis `inline`, tout le reste en `attachment`, avec
`X-Content-Type-Options: nosniff`.

La même fonction pure tourne dans le navigateur avant l'envoi — pour dire *quelle*
règle le fichier enfreint plutôt qu'un échec générique, et pour ne pas envoyer
deux mégaoctets destinés à être refusés. Elle ne remplace pas le contrôle serveur,
qui décide.

**Conséquences.**
- `pnpm dev` et les suites fonctionnent sans aucune infrastructure objet.
- Changer de fournisseur, c'est changer quatre variables d'environnement ; ce
  fichier de tests dit si le nouveau se comporte.
- L'objet d'un ancien logo n'est pas supprimé au moment du remplacement : la
  ligne est déliée, la purge appartient à un job qu'on peut relancer, pas à la
  requête que l'utilisateur attend.

---

<a id="adr-038"></a>
## ADR-038 — La portée d'un collaborateur est une clause, écrite une fois

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 4

**Contexte.** `project.read` dit qu'un collaborateur peut lire des projets. Il ne
dit pas **lesquels**, et cette question a une seule réponse : ceux dont il est
membre (`project_members`). Les rôles au-dessus — `owner`, `direction`,
`manager` — portent `project.read_all` et voient toute l'organisation.

RLS répond « quel locataire », pas « quelles lignes à l'intérieur ». La portée
collaborateur est donc la **deuxième barrière** (CLAUDE.md §6), et elle vit dans
le code — au risque, si on la disperse, d'être appliquée sur la liste et oubliée
sur la fiche.

**Décision.** Une fonction, `scopedToActor(actor)`, dans
`src/modules/projects/queries.ts`. Elle rend `undefined` pour un acteur
privilégié — pas une condition toujours vraie, pour que le SQL généré ne porte
pas un filtre qui ne filtre rien — et sinon un `EXISTS` sur `project_members`.
**Toute** lecture d'un projet passe par elle : liste, fiche, équipe, jalons.

Un projet hors portée répond **404**, jamais 403 : confirmer qu'il existe
ailleurs dans l'organisation serait déjà une divulgation.

**Ce qui le prouve.** Deux tests, à deux niveaux, et les deux mordent :
- `tests/e2e/projects.spec.ts` — un manager crée deux projets, n'ajoute le
  collaborateur qu'à un seul ; celui-ci voit un projet dans la liste et reçoit
  404 sur l'URL de l'autre. Vérifié par mutation : en neutralisant
  `scopedToActor`, le test échoue.
- `tests/integration/project-scope.test.ts` — la clause elle-même, contre de
  vraies politiques, y compris le cas où une ligne `project_members` pointerait
  vers un projet d'un autre locataire : la **FK composite** le refuse.

**Corollaire découvert en vérifiant.** L'écran des projets chargeait d'emblée les
options du formulaire — la liste des clients et celle des collègues. Or
`member.read` n'appartient pas au collaborateur : la page échouait en 404 pour
exactement les gens que la portée existe pour servir. Une page ne doit pas
charger ce que son lecteur n'a pas le droit de lire. `can()` est donc appelé
**avant** la lecture, pas après le refus, et ce qui est masqué l'est pour la même
raison qu'il est refusé — jamais l'inverse (CLAUDE.md §6).

---

<a id="adr-039"></a>
## ADR-039 — Le fuseau est un attribut du projet, pas du lecteur

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 4

**Contexte.** « En retard » est une question sur un **jour calendaire**, et un
jour calendaire n'existe que dans un fuseau (R9). Une échéance au 15 n'est pas
manquée à 23 h le 14 à Abidjan parce qu'il est déjà le 15 à Paris.

**Décision.** `projects.timezone`, `NOT NULL`, renseigné à la création depuis le
fuseau du créateur et modifiable ensuite. Les comparaisons passent par des
fonctions **pures** — `calendarDate`, `isOverdue`, `daysUntil`,
`milestoneStatusFor` — qui prennent le fuseau et l'instant en arguments.

La conversion utilise `Intl`, jamais un décalage calculé à la main : le
changement d'heure casse silencieusement les offsets deux fois par an, et un
test le vérifie sur la bascule française du 29 mars 2026.

**Conséquences.** Le statut d'un jalon est **dérivé**, pas stocké pour
l'affichage : `reached` est un fait que quelqu'un a enregistré et que l'horloge
ne défait pas ; `missed` est le verdict de l'horloge dans le fuseau du projet.
Une liste n'est donc jamais périmée entre deux passages d'un job nocturne.

---

<a id="adr-040"></a>
## ADR-040 — `defineQuery` distingue ce qu'on passe de ce que le handler reçoit

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 4

**Contexte.** La passerelle était typée sur un seul paramètre : l'entrée de
l'appelant et l'entrée du handler étaient le **même** type. C'est faux dès que le
schéma fait un travail — `.default()`, `.transform()`, `z.coerce`. Concrètement,
`listProjects({})` ne compilait pas : le schéma a un
`includeArchived: z.boolean().default(false)`, et l'appelant se voyait réclamer
le champ même que le défaut existe pour remplir.

**Décision.** `Definition<TRaw, TParsed, TOutput>` avec `input?: z.ZodType<TParsed, TRaw>`.
L'appelant passe `TRaw`, le handler reçoit `TParsed`.

**Conséquences.** Changement de types seulement, aucun changement de
comportement — et la rigueur est intacte : vérifié par `@ts-expect-error` qu'un
statut hors énumération et un champ inconnu sont toujours refusés. Les valeurs
par défaut d'un schéma redeviennent utilisables, ce qui évite la vraie tentation :
les recopier à chaque appel, jusqu'à ce que deux appels ne soient plus d'accord.

---

<a id="adr-041"></a>
## ADR-041 — Une action bloquée dit pourquoi

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 5

**Contexte.** `blocked` est le statut qui pourrit un tableau : personne ne sait
quoi débloquer, donc personne ne débloque. Le cahier des charges prévoit la
colonne `blocked_reason` ; rien n'obligeait à la remplir.

**Décision.** `checkBlocked` — pure, testée — refuse le statut `blocked` sans
motif non vide, et la règle s'applique à la création comme à la mise à jour comme
au changement de statut en un clic. Corollaire : quitter `blocked` **efface** le
motif, parce qu'un motif périmé fait mentir le tableau aussi sûrement qu'un motif
absent.

**Pourquoi pas dans Zod.** La règle est conditionnelle au statut, et un schéma
partiel — « ce champ est requis seulement si cet autre vaut ceci » — se recopie à
chaque variante d'entrée. Une fonction pure s'écrit une fois et se teste seule.

**Conséquence d'interface.** Les boutons de transition en un clic proposent tout
sauf `blocked` : celui-là passe par le formulaire, qui a un champ pour la raison.
On ne propose pas un geste qui sera refusé (principe UX 5).

---

<a id="adr-042"></a>
## ADR-042 — Une seule notion d'urgence, dans un service pur

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 5

**Contexte.** Trois écrans répondent à « qu'est-ce qui est urgent ? » — la liste
d'actions, My Work, le mode focus — et un quatrième s'y ajoutera (le tableau de
bord). Trois tris écrits séparément, ce sont trois réponses différentes à la même
question, et l'utilisateur qui les compare a raison de ne plus faire confiance.

**Décision.** Un tri, `byUrgency`, dans `src/modules/actions/service.ts` :
**en retard, puis aujourd'hui, puis par priorité, puis par échéance la plus
proche**, le sans-date en dernier. `bucketByTiming` (My Work), `focusSelection`
(mode focus) et `groupByStatus` (kanban) s'appuient tous dessus.

Le calcul du retard passe par `src/lib/dates` — pas par le module projets. La
frontière de modules l'a signalé au moment où `actions/service.ts` a voulu
importer `projects/service.ts` : `index.ts` est une entrée **serveur** (ADR-030),
donc l'importer depuis un service pur l'aurait rendu inutilisable côté client.
« Quel jour est-on à Abidjan » n'est pas une connaissance du domaine projet ;
c'est de l'arithmétique de calendrier, et elle vit dans `lib`.

**Le mode focus plafonne à cinq, et n'ouvre pas en dessous de trois.** Le
plafond *est* la fonctionnalité : une liste « focus » de vingt est un backlog
renommé. En dessous de trois, il n'y a rien sur quoi se concentrer.

---

<a id="adr-043"></a>
## ADR-043 — `action.update_own` a besoin d'une règle de ligne

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 5

**Contexte.** La matrice dit qu'un `collaborator` porte `action.update_own`. Elle
ne peut pas dire *lesquelles* : ça dépend de la ligne. Sans seconde moitié,
`update_own` est exactement `update_any` avec un nom rassurant.

**Décision.** `src/modules/actions/policy.ts` — pure, testée — répond à « cette
personne peut-elle modifier CETTE action ». « Sienne » veut dire : responsable,
ou collaborateur listé, ou l'auteur de la ligne. Plus étroit, un collaborateur ne
peut pas cocher le travail qu'on vient de lui confier ; plus large, la distinction
disparaît.

La fonction prend le **verdict** de `can()`, pas un `Actor` : la matrice reste la
source unique de ce qu'un rôle peut faire, et ce fichier reste testable sans elle.

**Refus en 404, jamais 403** — confirmer que la ligne existe est déjà une
divulgation. Même posture qu'ailleurs dans le produit.

Un cas séparé : **on ne supprime que ses propres commentaires**, quel que soit le
rôle. Un manager qui efface le commentaire d'un collègue réécrit un historique ;
ce n'est pas une permission, c'est une réécriture.

---

<a id="adr-044"></a>
## ADR-044 — Une transaction, une requête à la fois

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 5

**Contexte.** Trouvé au LOT 5, en lisant les journaux du serveur E2E :

> `Calling client.query() when the client is already executing a query is deprecated`

`listActionTaxonomies` lançait ses trois `SELECT` en `Promise.all`. Or toutes les
requêtes d'un handler passent par **la même connexion**, à l'intérieur d'une seule
transaction `withTenant` : `pg` ne les entrelace pas, il les met en file — et la
prochaine version supprimera le filet.

**Décision.** À l'intérieur d'un handler, les lectures sont **séquentielles**. Le
`Promise.all` reste légitime là où les appels ne partagent pas de connexion :
plusieurs `defineQuery` depuis une page, par exemple, ouvrent chacun sa propre
transaction.

**Conséquence.** Le parallélisme gagnait une milliseconde et coûtait la
correction. Une règle simple : si deux `await` touchent le même `db`, ils
s'écrivent l'un après l'autre.

---

<a id="adr-045"></a>
## ADR-045 — `event.currentTarget` ne survit pas à un `await`

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 5

**Contexte.** Le formulaire de commentaires affichait « Impossible d'enregistrer
ce commentaire » alors que le commentaire **était** enregistré. La cause :

```ts
await addComment({ … })
event.currentTarget.reset()   // currentTarget vaut null ici
```

`currentTarget` n'est valide que pendant la propagation de l'événement. Après un
`await`, il est `null`, le `.reset()` lève, le `catch` attrape — et signale un
échec pour une écriture réussie.

**Ce que ça a coûté à trouver**, et pourquoi c'est consigné : aucune erreur
serveur, aucune trace, un message d'échec parfaitement crédible. Le diagnostic n'a
avancé qu'en constatant que **rien** n'était journalisé côté serveur — donc que
l'erreur était dans le navigateur.

**Décision.** Capturer l'élément **avant** tout `await` :
`const element = event.currentTarget`. Et, plus généralement : un `catch` qui
enveloppe autre chose que l'appel réseau attribue à cet appel des erreurs qui ne
sont pas les siennes.

---

<a id="adr-046"></a>
## ADR-046 — Un écart qu'on ne peut pas calculer dit pourquoi

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 6

**Contexte.** `computeGap` peut échouer pour quatre raisons très différentes :
pas de cible chiffrée, aucun résultat encore saisi, une cible à zéro, ou —
la plus grave — **deux devises différentes** (ADR-024). Rendre `number | null`
les aurait toutes affichées comme un tiret, c'est-à-dire comme la même chose.

**Décision.** `Gap` est une union discriminée :

```ts
| { computed: true; difference; achievementPercent; verdict }
| { computed: false; reason: 'no_target' | 'no_result' | 'currency_mismatch' | 'zero_target' }
```

L'écran distingue les quatre, et la **non-concordance de devises est montrée
comme une erreur**, pas comme une absence : c'est le seul cas où le produit
*aurait pu* produire un nombre plausible et a délibérément refusé. Un chiffre
faux dans un rapport client coûte plus cher qu'une case vide.

La vérification de devise passe **avant toutes les autres** : signaler « aucun
résultat » d'abord masquerait une comparaison qui ne sera jamais possible.

**Le verdict dépend de la direction de la métrique.** 130 % d'une cible de
chiffre d'affaires, c'est en avance ; 130 % d'une cible de coût par lead, c'est
en retard. C'est toute la raison pour laquelle `direction` est une colonne de
`metrics` et pas une hypothèse dans un graphique — et un test le vérifie contre
les lignes **réellement seedées**, pas contre des valeurs inventées.

**Tolérance.** À ±5 % de la cible, le verdict est « dans les clous » : un signe
devant un écart de 2 % suggère une précision que la mesure n'a pas.

---

<a id="adr-047"></a>
## ADR-047 — Une métrique porte son agrégation et sa direction

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 6

**Contexte.** Le catalogue de 24 métriques aurait pu n'être qu'une liste de
libellés. Il ne peut pas : sans savoir **comment** plusieurs mesures deviennent
un nombre sur une période, ni **si « plus » est mieux**, un objectif n'est pas
calculable.

**Décision.** Chaque `metric` porte :

| Colonne | Ce qu'elle évite |
|---|---|
| `aggregation` | Sommer un taux. Deux semaines à 3 % ne font pas une quinzaine à 6 % — CTR et taux de conversion sont en `avg`, un score de performance en `last` |
| `direction` | Noter à l'envers. `spend`, `cpl`, `cpc` et `bugs` sont `lower_is_better` |
| `kind` · `decimals` | Afficher un ratio comme un entier, ou un montant sans ses décimales |
| `is_computed` · `formula` | Stocker deux fois la même vérité |

**Les métriques calculées ne sont pas stockées.** CTR, CPC, CPL, ROAS, ROI et le
taux de conversion sont dérivés **à la lecture** (LOT 7) depuis leur formule. Un
ratio stocké est un ratio qui contredit son propre numérateur la première fois
que l'un des deux est corrigé.

**Le seed corrige en place.** Tout sauf le `code` est réécrit à chaque exécution :
une métrique dont la direction était fausse notait les objectifs à l'envers, et
le correctif doit atteindre les installations qui ont déjà la ligne.

---

<a id="adr-048"></a>
## ADR-048 — Un objectif est visible du client par défaut

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 6

**Contexte.** La règle 2 impose `is_client_visible = false` par défaut partout.
`objectives` est la seule exception du modèle, et elle mérite d'être écrite
plutôt que découverte.

**Décision.** `objectives.is_client_visible` vaut `true` par défaut.

**Pourquoi ce n'est pas une entorse.** L'objectif est **ce que le client paie**.
Un portail qui montre l'activité sans montrer ce qu'elle poursuit est une liste
de tâches — exactement ce que Doomee refuse d'être. Ce qui reste interne, c'est
l'**analyse** autour de l'objectif : les commentaires (`internal` par défaut), le
Health Score (ADR-025), les notes d'équipe.

**Ce qui empêche la dérive.** La visibilité par défaut ne dispense de rien :
l'exposition réelle passera par les vues `portal.*` à colonnes explicites
(ADR-026) au LOT 9. Un défaut à `true` sur une colonne ne met rien dans une vue
qui ne la sélectionne pas — c'est précisément pour ça que la barrière est une
vue et pas un drapeau.

---

<a id="adr-049"></a>
## ADR-049 — Ce qui dépasse scrolle dans son propre conteneur, jamais la page

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 6

**Contexte.** Le LOT 6 ajoute un cinquième onglet à la fiche projet. Cinq
onglets ne tiennent pas dans 393 pixels CSS, et la rangée ne scrollait pas : elle
élargissait **la page**. Résultat mesuré : **83 px de défilement horizontal** sur
un téléphone.

Ce n'était pas un défaut cosmétique. Une page décalée horizontalement déplace
**toutes** les cibles de l'écran : sur huit tests E2E mobiles, le clic sur
« Enregistrer » d'une feuille atterrissait sur le `<select>` d'à côté. Le
symptôme — « un champ intercepte les événements de pointeur » — ne ressemblait en
rien à sa cause, et a coûté plusieurs pistes fausses : d'abord un pied de
formulaire collant, puis une restructuration du modèle de défilement de la
modale, toutes deux inutiles et l'une d'elles nuisible.

**Ce qui a fini par trancher** : revenir à `HEAD` et constater que les mêmes
tests passaient en 23 s. Le code du lot en cours était donc en cause, pas la
modale ; il restait à mesurer, et `scrollWidth - clientWidth` a donné la réponse
en une ligne.

**Décision.** Un motif qui peut dépasser en largeur scrolle **dans son propre
conteneur** : `overflow-x-auto` sur la rangée, `shrink-0` sur les éléments. La
page, elle, ne défile jamais latéralement.

La rangée d'onglets devient un composant, `Tabs` — sa **troisième** occurrence
(clients, projets, actions), pas sa première (règle 8). Les trois écrans
héritent du correctif, et le prochain aussi.

**Ce qui empêche la régression.** `tests/e2e/projects.spec.ts` mesure
`scrollWidth - clientWidth` sur la fiche projet et vérifie que les cinq onglets
restent atteignables. Vérifié par mutation : en retirant `overflow-x-auto`, le
test échoue avec 115 px.

**La leçon, consignée parce qu'elle se reproduira** : quand un clic est
intercepté par un élément voisin, mesurer la largeur du document avant de
soupçonner la pile de positionnement.

---

## ADR-050 — Le formulaire de résultats est une donnée, pas un composant

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 7

**Contexte.** « Quel résultat a produit cette action ? » n'a pas la même réponse
selon le métier : une campagne publicitaire se mesure en impressions, clics et
coût par acquisition ; une prestation de conseil en livrables acceptés ; un
recrutement en candidats qualifiés. Coder un formulaire par métier, c'est
s'engager à livrer une version pour chaque nouveau client.

**Décision.** Le formulaire est décrit **en base** : `result_form_templates` et
`result_form_fields` (règle 7). Un gabarit à `organization_id NULL` est un
gabarit système, lisible par toutes les organisations et modifiable par aucune ;
une organisation peut créer les siens.

Le rendu est un **moteur** : `buildFormSchema(fields)` construit un schéma Zod
**strict** à l'exécution à partir des champs, et l'écran affiche ce que le schéma
décrit. Ajouter un champ ne touche pas au code.

**Le point délicat — les nombres restent des chaînes.** Un champ numérique est
validé par `/^-?\d{1,16}(\.\d{1,4})?$/` et transporté **tel quel** jusqu'à
`numeric(20,4)`. Il n'est jamais converti en `number` en chemin : un `double` IEEE
754 n'a que 15 à 17 chiffres significatifs, et une mesure qui s'arrondit n'est
plus une preuve (CLAUDE.md §7 — *jamais de float*).

`buildFormSchema` est **pur** : il vit dans `form-engine.ts`, sans `db` ni
`headers()`, et se teste sans infrastructure.

**Ce qui empêche la régression.** `tests/unit/results-form-engine.test.ts` couvre
la construction du schéma, le refus d'un champ inconnu (le schéma est `strict`)
et la précision ; `tests/integration/results.test.ts` vérifie qu'une valeur à
quatre décimales ressort de PostgreSQL identique à elle-même.

---

## ADR-051 — Une clé étrangère composite ne peut pas viser une table de référence partagée

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 7

**Contexte.** La règle du §7 est sans ambiguïté : les clés étrangères
intra-tenant sont **composites**, `(organization_id, parent_id) → parents(organization_id, id)`.
Appliquée mécaniquement à `results.template_id`, elle a produit une violation à
la première écriture : `results_org_template_fk`.

**La cause.** Un gabarit **système** porte `organization_id = NULL`. Une clé
composite `(organization_id, template_id)` ne peut donc jamais le désigner : la
ligne parente n'a pas de tenant à confronter. La contrainte n'était pas trop
stricte, elle était **inapplicable**.

Le diagnostic a demandé de voir l'erreur brute : `defineAction` convertit tout
ce qui n'est pas une `AppError` en `internal`, et l'écran ne disait que
« une erreur est survenue ». Un `console.error` temporaire dans le `catch` de la
passerelle a donné le nom de la contrainte en une seconde — puis a été retiré.

**Décision.** La forme de la clé suit la **propriété** de la ligne visée, pas la
table qui la porte :

| Le parent… | Clé |
|---|---|
| appartient à un tenant (`projects`, `actions`, `clients`) | **composite** `(organization_id, id)` |
| est une table de référence partagée (`metrics`, `action_types`, `channels`, `result_form_templates`) | **simple**, par `id` |

C'est déjà la forme de `clients.industry_id` et de `actions.action_type_id` ;
`results.template_id` s'y range. L'isolation n'est pas perdue : elle est portée
par la RLS de `results`, et une table de référence partagée est lisible de tous
par construction.

**Ce qui empêche la régression.** La suite d'isolation générée depuis le schéma
couvre `results` : une organisation ne lit, n'écrit ni ne modifie la ligne d'une
autre. Le commentaire sur la colonne explique *pourquoi* elle est simple, pour
que la prochaine lecture ne la « corrige » pas.

---

## ADR-052 — Une métrique dérivée s'abstient plutôt que d'inventer un zéro

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 7

**Contexte.** Certaines métriques ne sont pas saisies, elles se **déduisent** :
le taux de clic est `clics / impressions`, le coût par acquisition
`dépense / conversions`. Le dénominateur peut valoir zéro — une campagne qui n'a
encore rien converti.

**Décision.** `DERIVED_METRICS` déclare chaque métrique dérivée par son `code`,
ses `inputs`, sa `formula` lisible et sa fonction `compute`. `ratio()` renvoie
`null` quand le dénominateur est nul, et `deriveMetrics()` **omet** la métrique
plutôt que d'écrire `0`.

Un coût par acquisition de `0` se lit « gratuit » : c'est la lecture exactement
inverse de la vérité. L'absence est la seule réponse honnête, et elle rejoint
ADR-046 — un écart qu'on ne peut pas calculer dit pourquoi.

Toujours pas de conversion entre devises (ADR-024) : une métrique dérivée de deux
montants n'est calculée que s'ils portent la **même** devise.

**Ce qui empêche la régression.**
`tests/unit/results-derived-metrics.test.ts` vérifie le dénominateur nul, la
propagation de l'absence et le refus de mélanger deux devises.

---

## ADR-053 — Le résultat et le compteur qu'il déplace sont un seul fait

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 7

**Contexte.** Enregistrer un résultat doit faire bouger l'objectif : c'est le
milieu de la boucle (`RÉSULTAT → ANALYSE`). Recalculer `objectives.current_value`
après coup — dans un job, dans un second appel — ouvre une fenêtre pendant
laquelle l'écran montre un résultat saisi et un objectif qui l'ignore.

**Décision.** `recordResult` écrit le résultat, ses `result_metrics`, puis
appelle `refreshObjectives(db, projectId)` **dans la même transaction**. Si l'une
échoue, aucune n'a eu lieu. C'est la même règle qu'ADR-013 pour
`progress_percent`, appliquée un cran plus haut.

**Deux pièges rencontrés en chemin.**

1. **`CASE $1 WHEN 'avg' …` ne compile pas.** PostgreSQL ne peut pas inférer le
   type d'un paramètre lié à cet endroit. L'agrégation vient donc d'une table de
   correspondance fermée (`AGGREGATES`) passée par `sql.raw` — un ensemble clos
   de mots-clés, jamais une chaîne venue de l'utilisateur.
2. **Aucune devise n'est inventée.** La devise d'une mesure monétaire est celle
   du **projet** (`budgetCurrency`), jamais une constante écrite dans le code.
   Une valeur codée en dur produit des agrégats faux et silencieux (ADR-024).

**Ce qui empêche la régression.** `tests/integration/results.test.ts` vérifie que
l'objectif suit la somme des mesures, et surtout qu'un `ROLLBACK` le laisse
**intact** : une transaction avortée ne doit pas laisser un compteur avancé sans
le résultat qui le justifie. `tests/e2e/results.spec.ts` parcourt la boucle de
bout en bout — clôturer une action, saisir le résultat, voir l'écart se combler.

---

## ADR-054 — Un agrégat dérivé est une vue matérialisée, rafraîchie hors requête

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 7

**Contexte.** « Cette métrique, pour ce client, sur cette période » est la
question que posent les tableaux de bord et les rapports. Y répondre depuis
`result_metrics` signifie parcourir toutes les mesures à chaque fois : à la
volumétrie des 12 mois (ADR-022), des centaines de milliers de lignes pour un
graphique que personne n'a attendu.

**Décision.** `result_metrics_daily`, **vue matérialisée**, et non une table
entretenue par triggers : un agrégat est **dérivé**, et une donnée dérivée qu'on
écrit à la main est une donnée dérivée qui dérive. Rafraîchie par un job
(`pnpm db:refresh-views`), jamais dans une requête.

`currency` fait partie de la clé de regroupement : deux devises ne tombent jamais
dans la même ligne (ADR-024).

**La vue n'est pas accordée à `app_user`.** Une vue matérialisée **ne peut pas**
porter de RLS : elle répondrait pour tous les tenants à la fois. Elle reste donc
lisible du seul migrateur, pour les jobs de reporting, qui passent
l'organisation explicitement. C'est l'exception qui confirme la règle 1, et elle
est gardée par un test.

**Deux erreurs commises et corrigées, parce qu'elles sont instructives.**

1. **Un index d'expression ne permet pas `REFRESH … CONCURRENTLY`.** La clé
   unique avait été écrite en `coalesce(project_id, '00000000-…')` pour rendre
   non nulles des dimensions qui peuvent l'être. PostgreSQL l'a refusée :
   *« Create a unique index with no WHERE clause on one or more **columns** »* —
   des colonnes, pas des expressions. La vue retombait donc sur le rafraîchissement
   **bloquant** à chaque exécution : exactement ce qu'elle existait pour éviter,
   et sans le moindre message. L'index porte désormais sur les colonnes nues,
   avec `NULLS NOT DISTINCT` (PostgreSQL 15+) qui lui fait **garantir** ce que le
   `GROUP BY` assurait déjà.
2. **Ne pas lire l'état dans un message d'erreur.** Le repli « vue non peuplée »
   testait `/has not been populated/`. PostgreSQL 16 dit
   *« CONCURRENTLY cannot be used when the materialized view is not populated »* :
   le repli était du **code mort**, et un serveur en locale française l'aurait
   tué de toute façon. La fonction interroge maintenant
   `pg_matviews.ispopulated` et **choisit** son chemin, au lieu d'essayer et de
   lire l'échec.

**Ce qui empêche la régression.** `tests/integration/derived-views.test.ts` : le
chemin concurrent, le repli sur une vue vidée par `REFRESH … WITH NO DATA`, la
séparation des devises, celle des organisations, l'exclusion d'un résultat
supprimé, et le refus d'accès à `app_user`. Les deux défauts ci-dessus ont été
trouvés **par** ce test, pas malgré lui.

**La leçon, consignée parce qu'elle se reproduira** : un repli qu'aucun test ne
déclenche n'est pas un filet de sécurité, c'est une ligne de code qui rassure.

---

## ADR-055 — Le seuil de couverture bloque, ou il n'existe pas

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 7

**Contexte.** La règle 10 du `CLAUDE.md` dit depuis le LOT 0 : *« `service.ts` (pur)
— ≥ 90 % de couverture, **bloquant** »*. En vérifiant la sortie de `pnpm verify`
au LOT 7, aucune couverture n'était mesurée : `pnpm test` lançait Vitest sans
`--coverage`, et `@vitest/coverage-v8` n'était même pas installé. La règle était
écrite, jamais appliquée — sept lots durant.

**Décision.** Le seuil est **exécuté** : `pnpm test` lance la couverture et
`thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 }` fait
échouer la commande en dessous.

La portée est volontairement **étroite** : `src/modules/**/service.ts` et les deux
moteurs purs du module Results. Les `queries.ts` et `mutations.ts` sont prouvés
contre une base réelle par la suite d'intégration ; compter leurs lignes ici
achèterait un plus gros chiffre et moins de vérité.

**Un piège rencontré** : déclarée à l'intérieur d'un `projects[]`, la
configuration `coverage` est **silencieusement ignorée**. Le rapport comptait
alors `tests/helpers` comme du code produit. C'est une option **racine**.

**Ce que la mesure a révélé, et qui a été corrigé.** `inspectAttachment` — la
fonction qui lit la **signature des octets** d'un fichier téléversé, c'est-à-dire
exactement le garde-fou d'ADR-037 — n'avait **aucun test unitaire** (71 % sur
`files/service.ts`). Elle en a maintenant neuf, dont le refus d'un SVG déguisé en
PDF et les deux bornes de la limite de 10 Mo. Les tons de statut et de priorité
des projets sont couverts branche par branche.

Résultat : 96,3 % d'instructions, 93,9 % de branches, 100 % de fonctions.

**Ce qui empêche la régression.** Le seuil lui-même, vérifié par mutation : porté
à 99 %, `pnpm test` échoue en nommant les trois métriques en défaut ; remis à
90 %, il repasse. Un seuil qu'on n'a jamais vu refuser n'est pas un seuil.

**La leçon, consignée parce qu'elle se reproduira** : une règle qui ne vit que
dans un document a déjà cessé d'être vraie. Vérifier que chaque garde-fou écrit
dans `CLAUDE.md` correspond à une commande qui échoue.

---

## ADR-056 — Seul le client valide, et le produit ne peut pas faire autrement

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 8

**Contexte.** Une agence qui peut valider son propre travail à la place de son
client n'a pas construit une étape de validation, elle a construit une case à
cocher. C'est pourtant la pente naturelle : le manager « sait » que le client
sera d'accord, et l'écran lui offre le bouton.

**Décision.** L'asymétrie est écrite **trois fois**, à trois niveaux, et chacune
suffirait seule :

| Niveau | Mécanisme |
|---|---|
| Matrice | `deliverable.approve` et `deliverable.request_changes` → `['client']`, et rien d'autre |
| Machine à états | chaque transition porte son **côté** (`internal` / `client`) ; les deux sorties de `client_review` appartiennent au client |
| Écran | en `client_review`, l'équipe interne ne voit **aucun bouton** — pas un bouton grisé, aucun — et une phrase qui dit à qui appartient la décision |

Le refus distingue `wrong_side` d'`illegal` : « vous ne pouvez pas valider à la
place du client » et « un brouillon ne se publie pas » sont deux problèmes
différents, et les confondre ferait passer le premier pour un bug (ADR-041).

**La réciproque est vraie aussi** : un client ne peut pas piloter le flux
interne. `draft → production`, `→ internal_review`, `→ published` lui sont
fermés.

**Une validation interne n'envoie rien.** `statusAfterReview('internal', 'approved')`
laisse le livrable en `internal_review` : le « c'est bon pour moi » d'un manager
ne doit pas atterrir tout seul dans le portail du client. Envoyer est un acte
**distinct et délibéré**, et c'est cet acte qui pose `is_client_visible`.

**Ce qui empêche la régression.**
`tests/unit/deliverables-service.test.ts` balaie **exhaustivement** les 7 états ×
7 cibles × 2 côtés et fige la liste des 9 mouvements légaux : une transition
ajoutée par inadvertance fait échouer le test au lieu d'arriver en production.
`tests/unit/permissions.test.ts` — « only the client approves a deliverable » —
vérifié par mutation : en ajoutant `manager` à `deliverable.approve`, il échoue.
`tests/e2e/deliverables.spec.ts` vérifie qu'en `client_review` **aucun** bouton
de validation n'existe sur la page.

---

## ADR-057 — Deux conditions pour qu'un client voie un livrable

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 8

**Contexte.** `is_client_visible` est un drapeau en opt-in (règle 2). Mais un
drapeau seul ne suffit pas : un brouillon coché par erreur resterait coché, et
le client verrait un travail non terminé présenté comme un livrable.

**Décision.** `isVisibleToClient` exige **les deux** : le drapeau **et** un état
qui a du sens à montrer (`client_review`, `changes_requested`, `approved`,
`published`). Le drapeau est le **consentement**, l'état est la **maturité**, et
ni l'un ni l'autre ne suffit.

Le drapeau n'est d'ailleurs pas posé par une case à cocher perdue dans un
formulaire : c'est **l'envoi au client** qui le pose. L'acte et l'exposition sont
la même décision, prise au même moment, par la même personne.

Cette fonction est la formulation **lisible** de la règle ; c'est la politique
RLS du portail (LOT 9) qui la rendra **vraie**. L'écran n'a jamais sécurisé quoi
que ce soit.

**Ce qui empêche la régression.** Le test unitaire balaie les 7 états avec le
drapeau à `false` (aucun visible) puis les 4 états mûrs avec le drapeau à `true`.

---

## ADR-058 — Une version et une décision ne se réécrivent pas

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 8

**Contexte.** « Quelle version le client a-t-il validée ? » doit avoir une
réponse des mois plus tard. Une table qui remplace ses lignes ne peut pas en
donner.

**Décision.** `REVOKE UPDATE ON deliverable_versions FROM app_user` et
`REVOKE UPDATE ON deliverable_reviews FROM app_user`.

- Une **version** est ce qui a été téléversé sous ce numéro. On la corrige en
  téléversant la suivante, jamais en la réécrivant.
- Une **revue** est une décision qui a été prise. Si `UPDATE` était accordé,
  « le client a validé la version 3 » pourrait devenir « la version 5 » sans
  laisser de trace, et la piste d'audit ne vaudrait plus rien.

`DELETE` reste accordé : supprimer un livrable emporte son historique, et c'est
voulu. C'est la même distinction que pour `result_metrics` (ADR-022).

`deliverable_reviews.version_id` est **obligatoire** : une demande de
modification qui ne nomme pas sa version cesse de vouloir dire quelque chose dès
que la suivante est téléversée.

**Ce qui empêche la régression.** `tests/integration/deliverables.test.ts` : la
suite d'isolation généralisée liste les deux tables dans `NO_UPDATE`, et deux
tests ciblés vérifient le message exact — `permission denied for table
deliverable_versions` — en lisant la **cause** de l'erreur, pas l'enveloppe
« Failed query » dans laquelle Drizzle l'emballe (une assertion sur l'enveloppe
passerait pour n'importe quel échec, y compris celui où l'écriture a réussi).

---

## ADR-059 — Le pointeur de version courante s'écrit avec la version qu'il nomme

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 8

**Contexte.** `deliverables.current_version_id` est dénormalisé pour qu'une liste
n'exécute pas une sous-requête corrélée par ligne (ADR-013). Un pointeur
dénormalisé est un pointeur qui peut mentir.

**Décision.** La ligne de version et le pointeur qui la nomme sont écrits dans
**une seule transaction**. Un `current_version_id` qui désigne une ligne
inexistante est une page de détail qui plante ; une version orpheline est une
itération que personne ne retrouve.

Le **numéro** de version, lui, n'est pas un compteur sur le parent :
`nextVersionNumber` le calcule depuis les lignes existantes. Un compteur qui vit
à côté des lignes qu'il compte est un compteur qui dérive.

**Ce qui empêche la régression.** Un test d'intégration insère une version,
déplace le pointeur, puis lève une erreur : après le `ROLLBACK`, le pointeur est
inchangé **et** la version n'existe pas.

---

## ADR-060 — Une version doit être quelque chose

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 8

**Contexte.** Le modèle autorise un fichier **ou** un lien : une charte
graphique est un PDF, un site livré est une URL. Rien n'empêchait, mécaniquement,
une ligne qui ne porte ni l'un ni l'autre.

**Décision.** `describesSomething()` — pur — exige au moins l'un des deux, et la
mutation refuse avec `errors.version_needs_content`. Une version vide est une
promesse vide : le client l'ouvre, ne trouve rien, et la validation qu'elle
déclenche est la validation de rien.

La règle vit dans le **service**, pas dans le schéma Zod : « une version doit
être quelque chose » est une règle **produit**, pas une règle d'analyse
syntaxique. Le formulaire la vérifie aussi, pour répondre vite — mais c'est le
serveur qui décide.

Les liens sont validés en `http`/`https` uniquement. Un `javascript:` dans un
`href` est une faille XSS qui attend un clic.

**Ce qui empêche la régression.** Le test unitaire couvre les quatre cas (rien,
`null` des deux côtés, une chaîne d'espaces, un vrai lien) ; l'E2E soumet le
formulaire vide et vérifie que la feuille **reste ouverte**, c'est-à-dire que
rien n'a été créé.

---

## ADR-061 — `security_invoker` exige des droits par colonne, et c'est tant mieux

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 9

**Contexte.** ADR-026 tranche : les vues `portal.*` portent
`security_invoker = true`, pour que la RLS continue de s'appliquer **sous** la
vue au lieu d'être contournée. À la première lecture du portail, tout a échoué :

```
permission denied for table projects
```

**La cause.** `security_invoker = true` fait exécuter la vue avec les droits de
**l'appelant**. Or la migration 0002 révoque *tout* droit d'`app_portal` sur le
schéma `public`. La RLS ne remplace pas un `GRANT` : une politique dit *quelles
lignes*, un grant dit *si l'on peut demander*.

**Les options, et pourquoi les deux premières sont mauvaises.**

| | |
|---|---|
| `security_invoker = false` | La vue s'exécute comme son propriétaire et **court-circuite la RLS**. La vue redeviendrait la seule barrière — ce qu'ADR-026 refuse explicitement. |
| `GRANT SELECT` sur la table entière | Le portail pourrait lire `health_score`. C'est exactement la fuite qu'on prévient. |
| **`GRANT SELECT (colonnes)`** | ✅ |

**Décision.** Le droit est accordé **par colonne**, et la liste est exactement
ce que les vues sélectionnent. Vérifié contre PostgreSQL, pas supposé :

```
SELECT name FROM public.projects          → les mêmes lignes que la vue
SELECT * FROM public.projects             → permission denied
SELECT health_score FROM public.projects  → permission denied
SELECT id FROM public.projects WHERE health_score > 0
                                          → permission denied
```

Le dernier cas est celui qui compte : une colonne non accordée est refusée
**jusque dans un `WHERE`**, donc un Health Score ne se devine pas non plus par
dichotomie.

La garantie d'ADR-026 est donc **inchangée** — aucune colonne interne n'atteint
un client, par aucune route — mais elle est désormais tenue par le système de
droits de PostgreSQL plutôt que par la vue seule. Ajouter une colonne à une
table ne l'expose toujours pas : il faut un geste dans la vue **et** un geste
dans le grant, dans une migration que quelqu'un relit.

**Un corollaire : les sous-requêtes de politique aussi.** Une politique dont le
`EXISTS` porte sur une **autre** table est une requête ordinaire : elle
s'exécute avec les droits de l'appelant. Écrire
`EXISTS (SELECT 1 FROM projects p WHERE p.is_client_visible …)` aurait obligé à
accorder `is_client_visible` et `deleted_at` au portail — élargir la surface
pour répondre à une question par oui ou non. Les politiques appellent donc des
fonctions `SECURITY DEFINER` (`portal_sees_project`, `portal_sees_deliverable`,
`portal_sees_result`, `portal_sees_file`, `portal_sees_person`,
`portal_awaits_decision`) qui ne renvoient qu'un booléen.

Ce n'est pas un trou : ces fonctions lisent les **mêmes** réglages de session
que l'appelant (`app.organization_id`, `app.client_ids`), n'acceptent aucune
entrée libre, fixent leur `search_path`, et sont révoquées de `PUBLIC`. Le vrai
gain est ailleurs : « ce qui rend un projet visible d'un client » est écrit
**une fois**. On le change là, et les jalons, objectifs, actions, livrables,
résultats, commentaires, pièces jointes et le fil d'activité suivent.

**Ce qui empêche la régression.** `tests/integration/portal-leak.test.ts`
tente, pour dix couples table/colonne internes, la lecture directe, la lecture
dans un `WHERE`, et `SELECT *` ; et vérifie que la table de base et la vue
renvoient **les mêmes lignes**. `tests/integration/rls-coverage.test.ts` vérifie
qu'`app_portal` ne détient aucun `SELECT` sur `public` et que ses droits
d'écriture se limitent aux portes déclarées.

---

## ADR-062 — `is_client_visible` n'est pas une portée client

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 9

**Contexte.** La suite de fuite portail a trouvé une vraie faille, écrite de ma
main quelques minutes plus tôt. La politique de lecture sur `files` était :

```sql
organization_id = portal_organization_id() AND is_client_visible AND deleted_at IS NULL
```

Elle se lit bien. Elle est fausse. **Un client voyait les fichiers partagés d'un
autre client de la même agence.**

**Pourquoi la faute est facile.** `is_client_visible` dit « ceci *peut* être
montré à un client » — pas « à **ce** client ». Sur `projects`, la portée vient
de `client_id`. Sur `actions` ou `results`, elle vient du projet. Sur `files`,
il n'y a **ni l'un ni l'autre** : un fichier n'appartient à personne
directement. Le drapeau semblait donc suffire, et il ne suffisait pas.

**Décision.** Un fichier doit avoir **emprunté une route** que le client peut
voir. `portal_sees_file` en connaît trois, et il n'y en a pas d'autre :

1. une pièce jointe sur un projet visible ;
2. la version d'un livrable visible ;
3. le logo d'un de ses propres comptes clients.

Un fichier orphelin, fût-il coché « visible par le client », n'atteint personne.

**La règle générale, à appliquer à chaque nouvelle table exposée** : un drapeau
est un **consentement**, jamais une **portée**. Les deux sont nécessaires. C'est
la même structure qu'ADR-057 (consentement + maturité) vue sous un autre angle.

**Ce qui empêche la régression.** Deux tests nommés d'après la faille — « ne
montre jamais un fichier partagé appartenant à un autre client » et « ne montre
jamais un fichier orphelin » — plus le balayage générique qui exige **une seule
ligne** par vue alors que la fixture en construit quatre. Vérifié par mutation :
en remettant l'ancienne politique, quatre tests échouent en nommant le problème.

**La leçon, consignée parce qu'elle se reproduira** : la suite de fuite portail
n'est pas une formalité de fin de lot. Elle a trouvé une faille réelle dans du
code écrit avec attention, quinze minutes après son écriture.

---

## ADR-063 — Le client commente un livrable et un projet, pas une action

**Statut** : Accepté **par défaut, réversible** · **Date** : 2026-09-15 · **Lot** : 9

**Contexte.** La décision ouverte **O9** demandait : le client peut-il commenter
une **action**, ou seulement un livrable et un rapport ? Le LOT 9 ne pouvait pas
livrer le fil de discussion sans trancher.

**Décision (par défaut, à confirmer).** Le client commente un **livrable** et un
**projet**. Pas une action.

**Pourquoi ce défaut-là.**
- C'est le choix **restrictif**, et la règle 2 dit que l'exposition est un
  geste délibéré. Élargir plus tard est **additif** ; restreindre plus tard
  retire quelque chose à des utilisateurs qui s'en servaient.
- Une **action** est l'organisation interne du travail. Un livrable est ce que
  le client reçoit ; un projet est ce qu'il achète. Les deux premiers sont des
  objets de conversation, le troisième est une mécanique d'atelier.
- Le portail n'expose d'ailleurs les actions qu'en lecture et seulement quand
  elles sont explicitement partagées.

`portalCommentSchema` fixe `entityType` à un ensemble **fermé de deux**, et la
politique d'écriture ne connaît que ces routes.

> ⚠️ **À confirmer par le commanditaire.** Ouvrir le commentaire client sur une
> action demanderait : une valeur de plus dans le schéma, une route de plus dans
> la politique d'écriture, et un fil sur la fiche action du portail. Aucune
> migration destructive, aucune reprise de données.

---

## ADR-064 — Le portail écrit par des portes nommées, jamais par une vue

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 9

**Contexte.** Les vues `portal.*` sont des surfaces de **lecture**. Il fallait
décider par où passent les deux écritures d'un client : un commentaire, et une
décision sur un livrable.

**Décision.** Vers les **tables de base**, à travers des politiques qui portent
une clause `WITH CHECK`. Une vue sur une table filtrée n'est pas une cible
d'insertion saine, et surtout : c'est le `WITH CHECK` qui rend l'écriture sûre,
pas la vue.

Trois portes, et la liste est figée par un test :

| Table | Droit | Ce que la politique exige |
|---|---|---|
| `comments` | `INSERT` | `visibility = 'shared'`, `author_user_id = app.user_id`, et le projet est le sien |
| `deliverable_reviews` | `INSERT` | `scope = 'client'`, `reviewer_user_id = app.user_id`, et le livrable **attend sa décision** |
| `deliverables` | `UPDATE (status, approved_at, approved_by, updated_at)` | statut de départ `client_review`, statut d'arrivée `approved` ou `changes_requested` |
| `audit_logs` | `INSERT` | même organisation, même acteur — **jamais de `SELECT`** |

**Rien n'est pris de la charge utile.** Ni l'organisation, ni le client, ni
l'auteur : les trois viennent de `app.organization_id`, `app.client_ids` et
`app.user_id`, épinglés par `withPortal` **dans la transaction**. Un client ne
peut donc pas signer au nom d'un autre, commenter chez le voisin, ni valider un
livrable qui ne lui a jamais été envoyé — et rien de tout cela ne dépend du soin
avec lequel le handler a été écrit.

**Le `GRANT UPDATE` par colonne** sur `deliverables` est le seul endroit du
projet où les droits par colonne de PostgreSQL sont le bon outil : un client
change le statut et l'horodatage de validation, et ne peut toucher ni le titre,
ni `is_client_visible`, ni le propriétaire — la requête est refusée avant même
d'être évaluée.

**La piste d'audit est une seule piste.** Une validation client est parmi les
actes les plus lourds de conséquence du produit : elle est écrite dans
`audit_logs`, dans la **même transaction** que le changement. D'où le `GRANT
INSERT` — et le refus absolu du `SELECT`, parce que `audit_logs` traverse les
tenants par construction et qu'un portail qui pourrait la lire lirait
l'historique de toutes les organisations à la fois.

**Un piège rencontré, pour la deuxième fois.** PostgreSQL ne sait pas inférer un
type **enum** pour un paramètre **lié** : `INSERT INTO c (kind) VALUES ($1)`
échoue avec *« column is of type entity_type but expression is of type text »*.
Un littéral dans le texte SQL passe, un paramètre non. Même famille que le
`CASE $1 WHEN 'avg'` du LOT 7 (ADR-053). Chaque valeur d'enum liée porte
désormais son `::type`.

**Ce qui empêche la régression.** `tests/integration/portal-leak.test.ts` tente
un commentaire interne, un commentaire signé d'un autre, un commentaire chez un
autre client, une revue « interne » écrite par le client, une publication, et la
modification de n'importe quelle autre colonne : les six sont refusés par la
base. `tests/e2e/portal.spec.ts` parcourt le cycle complet dans deux navigateurs.

---

## ADR-065 — Le client voit la moitié tournée vers lui

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 10

**Contexte.** Un insight partagé avec le client est la page la plus précieuse du
produit : « voilà ce qu'on a appris de votre budget, et voilà ce qu'on
recommande ». Le **même** insight montré en entier lui livrerait le
post-mortem interne de l'agence.

**Décision.** Quatre champs en interne, **trois** dans la vue portail :

| Champ | Portail |
|---|---|
| `what_worked` | ✅ |
| `what_we_learned` | ✅ |
| `recommendation` | ✅ |
| **`what_didnt`** | ❌ **jamais** |

« Ce qui n'a pas marché de notre côté » est une conversation qu'une agence
**choisit** d'avoir. Une colonne ne doit pas l'avoir à sa place — surtout pas
par le jeu d'un drapeau coché un vendredi soir.

Ce n'est pas de la dissimulation : `what_we_learned` et `recommendation` sont
partagés, et c'est là que l'enseignement vit. Ce qui reste interne, c'est
l'**attribution** de l'échec, pas l'échec.

L'insight reste en **opt-in** comme tout le reste (règle 2), et la portée suit
la règle habituelle : un insight de projet passe par `portal_sees_project`, un
insight de client par ses `client_ids`.

**Ce qui empêche la régression.** `what_didnt` est dans la liste noire de
`tests/integration/portal-leak.test.ts`, qui balaie **toutes** les colonnes de
**toutes** les vues du schéma `portal` depuis le catalogue. Plus deux tests
nommés : la vue renvoie les trois champs tournés vers l'extérieur, et la colonne
est refusée dans la vue **comme** dans la table de base.

---

## ADR-066 — La boucle se parcourt en un clic, ou elle ne se parcourt pas

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 10

**Contexte.** C'est le lot où le produit doit tenir sa promesse. Les six étapes
existaient toutes ; rien ne les **reliait**. Un utilisateur pouvait lire un
résultat, ouvrir un autre écran, retaper son analyse dans un insight, en relire
la recommandation, ouvrir un troisième écran et retaper la même phrase en titre
d'action. Chacune de ces recopies est un endroit où l'on renonce.

**Décision.** Les deux arêtes qui manquaient deviennent des liens, et les deux
transportent ce qui a déjà été écrit :

| Arête | Ce qui est transporté |
|---|---|
| `RÉSULTAT → INSIGHT` | l'`analysis` remplit « ce qu'on en apprend », la `recommendation` remplit « ce qu'on recommande », et le résultat est **attaché** |
| `INSIGHT → PROCHAINE ACTION` | la `recommendation` devient le **titre** de l'action, coupé sur une frontière de mot |

*Less typing* (règle 10) n'est pas une commodité ici : c'est la condition pour
que la boucle soit réellement parcourue.

**Trois écritures, une transaction.** `createNextAction` écrit l'action, la
ligne de liaison et le `source_insight_id` de l'action **ensemble**. Une
prochaine action qui existerait sans son lien serait indiscernable d'une tâche
ordinaire, et l'affirmation « ceci est né de cet insight » cesserait
silencieusement d'être vérifiable.

**Le bouton refuse d'ouvrir un formulaire vide.** Un insight sans
recommandation n'a rien à produire : le bouton n'apparaît pas, une phrase dit
pourquoi (ADR-041), et le serveur refuse de toute façon.

**`ON DELETE SET NULL`, pas `CASCADE`.** Supprimer un insight ne supprime pas
les actions qu'il a fait naître. Le travail a été fait ; c'est le raisonnement
qu'on retire.

**Ce qui empêche la régression.** `tests/e2e/loop.spec.ts` — le test qui prouve
la proposition de valeur — parcourt les six étapes d'un bout à l'autre et
vérifie que l'analyse et la recommandation **arrivent avec le clic**, sans avoir
été retapées. En FR et en EN, desktop et mobile.

---

## ADR-067 — La boucle se lit, et elle dit où elle s'arrête

**Statut** : Accepté · **Date** : 2026-09-15 · **Lot** : 10

**Contexte.** Le `CLAUDE.md` demande, avant d'écrire quoi que ce soit : « est-ce
que ça aide à parcourir la boucle ? ». L'écran projet ne répondait nulle part à
la question pour le projet lui-même.

**Décision.** `readLoop` — **pur** — prend six compteurs et renvoie, pour chaque
étape, ce qu'elle contient et si elle est **bloquée**. Le `LoopStrip` le dessine
sur la fiche projet.

**Le choix qui compte : une seule étape est bloquée à la fois.** C'est la
**première** case vide après une suite de cases pleines. Un projet avec des
objectifs et des actions mais sans résultats est bloqué à RÉSULTAT ; lui dire
« vous n'avez aucun insight » serait vrai, inutile, et deux étapes trop loin. Un
écran qui propose six suggestions n'en fait suivre aucune.

Le jaune marque cette seule étape — jamais les étapes déjà franchies. Le jaune
est la couleur de **ce qu'il faut faire ensuite** (règle 9) ; six pastilles
jaunes ne désignent rien.

**« Bouclée » a un sens précis** : ce n'est pas « les six étapes sont non
vides », c'est la **dernière arête** — un insight a produit une prochaine
action. C'est exactement l'affirmation que Doomee fait, et elle est vraie ou
fausse pour un projet donné.

Les six compteurs arrivent en **une** requête : c'est une bande de six pastilles
sur une fiche, pas six allers-retours.

**Un piège rencontré.** Zod refuse `.partial()` sur un schéma portant un
`.refine()` — et il le refuse à l'**exécution**. `createInsightSchema.partial()`
passait le typecheck et cassait le `next build` à l'évaluation du module. Le
champ d'objet est désormais séparé du raffinement, ce qui rend l'erreur
impossible à réécrire.

**Ce qui empêche la régression.** `tests/unit/insights-service.test.ts` : le
premier trou et non tous les trous, exactement une étape bloquée même avec
plusieurs trous, « bouclée » qui exige les deux bouts, et le pourcentage arrondi
à l'entier. `tests/e2e/loop.spec.ts` vérifie que la bande dit « prochaine étape :
objectif » sur un projet neuf et « boucle bouclée » à la fin du parcours.

---

## Décisions tranchées avec le commanditaire — 2026-09-14

| # | Sujet | Décision | ADR |
|---|---|---|---|
| **O1** | Hébergement et résidence des données | **Union Européenne** pour le MVP, architecture portable sans dépendance à un fournisseur ni à une région (Afrique de l'Ouest possible plus tard) | [ADR-021](#adr-021) |
| **O2** | Multi-devise | **Stockage et affichage seuls**, pas de conversion ni de taux de change ; architecture préparée pour l'ajouter | [ADR-024](#adr-024) |
| **O3** | Volumétrie à 12 mois | 100 organisations · 1 000 projets · 100 000 actions · plusieurs centaines de milliers de résultats et d'événements ; évolutif au-delà sans refonte | [ADR-022](#adr-022) |
| **O7** | Contact client multi-comptes | **Oui** — un contact peut couvrir plusieurs comptes clients et plusieurs organisations (groupes, holdings) ; prévu dans le modèle dès le départ | [ADR-023](#adr-023) |
| **O10** | Health Score visible du client | **Non** au MVP — outil interne de pilotage ; un indicateur simplifié distinct pourra être exposé plus tard | [ADR-025](#adr-025) |
| **O5** | Rôle `owner` | **Validé** — modèle à 6 rôles arrêté ; `owner` est un rôle d'organisation et ne remplace pas le Super Admin de la plateforme | [ADR-012](#adr-012) |

---

## Décisions ouvertes — à traiter dans leur lot

| # | Sujet | Impact | À trancher avant |
|---|---|---|---|
| **O4** | Export Excel/CSV reporté en V2 — acceptable ? | Périmètre du LOT 12 | LOT 12 |
| **O6** | Gamification : activée par défaut ? désactivable par organisation ? | Paramètres d'organisation | LOT 14 |
| **O8** | Rétention des données après résiliation d'un abonnement | RGPD, purge | LOT 15 |
| **O9** | Le client peut-il commenter une **action**, ou seulement un livrable et un rapport ? | Portée du portail | LOT 9 |

> Aucune décision ouverte ne bloque désormais le LOT 1.
