# Doomee — Ordre de développement du MVP

> **Statut** : proposition en attente de validation
> **Règle absolue** : un lot ne démarre pas tant que le précédent n'est pas « terminé » au sens du §1.
> C'est la principale mitigation du risque R15 (sur-ingénierie).

---

## 1. Définition de « terminé »

Un lot est terminé quand **tous** ces points sont vrais :

- [ ] Le code compile en `strict` sans `any` ni `@ts-ignore`.
- [ ] Biome passe (lint + format).
- [ ] Les services purs du lot sont testés unitairement (≥ 90 % de couverture).
- [ ] Les tests d'intégration passent, **y compris les tests d'isolation tenant des nouvelles tables**.
- [ ] Le ou les scénarios E2E du lot passent, **en FR et en EN**.
- [ ] Aucune chaîne visible codée en dur ; `fr.json` et `en.json` sont à parité.
- [ ] Aucune donnée métier codée en dur (taxonomies en base).
- [ ] Les écrans fonctionnent à 375 px et ont été vérifiés au clavier.
- [ ] `axe` ne remonte aucune violation critique sur les écrans du lot.
- [ ] La matrice de permissions du lot est testée, y compris les cas de refus.
- [ ] Si le lot expose des données au portail : test de fuite écrit et vert, **et la vue `portal.*` liste explicitement ses colonnes** (ADR-026).
- [ ] Aucun SDK d'hébergeur importé hors de `src/lib/storage` et `src/lib/mail` (ADR-021).
- [ ] Tout montant introduit porte sa devise ; aucun agrégat ne somme deux devises (ADR-024).
- [ ] Documentation mise à jour (`database.md` si le schéma bouge, `decisions.md` si un arbitrage a été pris).

---

## 2. Les 15 lots

| # | Lot | Durée estimée | Livre |
|---|---|---|---|
| 0 | Socle technique | 1 sem. | Un dépôt qui compile, teste et déploie |
| 1 | Tenancy, auth, RLS | 2 sem. | Une organisation isolée, prouvée par des tests |
| 2 | Design system & shell | 1 sem. | Le vocabulaire visuel Doomee, FR/EN |
| 3 | Clients | 1 sem. | Critère MVP 1 |
| 4 | Projets | 1,5 sem. | Critères MVP 2, 6 |
| 5 | Actions & My Work | 2 sem. | Critères MVP 4, 5, 6 |
| 6 | Objectifs | 1 sem. | Critère MVP 3 |
| 7 | Résultats & formulaires intelligents | 2,5 sem. | Critère MVP 9 — **le cœur du produit** |
| 8 | Fichiers, livrables, validation client | 2 sem. | Critères MVP 7, 8 |
| 9 | Portail client | 1,5 sem. | Critères MVP 8, 13 |
| 10 | Insights & bouclage | 1 sem. | Critère MVP 10 — **la boucle se referme** |
| 11 | Project Health, risques, alertes | 1,5 sem. | Critère MVP 14 |
| 12 | Reporting & export PDF | 2,5 sem. | Critères MVP 11, 12 |
| 13 | Dashboards, calendrier, équipe, recherche, réunions | 2,5 sem. | Modules de pilotage |
| 14 | Notifications, automatisations, gamification | 1,5 sem. | Motivation & proactivité |
| 15 | Durcissement & mise en production | 1,5 sem. | Les 15 critères, vérifiés |

**Total : ~26 semaines** pour une personne à temps plein · **~14 semaines** à deux développeurs
(les lots 8/9 et 11/13 se parallélisent proprement).

---

## LOT 0 — Socle technique
**But** : personne n'écrit de fonctionnalité avant que la chaîne de qualité existe.

1. `pnpm` + Next.js 15 + TypeScript `strict` + `noUncheckedIndexedAccess` + `output: 'standalone'`.
2. Tailwind v4 + jetons Doomee dans `globals.css` + shadcn/ui initialisé.
3. Biome, Lefthook (pre-commit : format + lint + typecheck).
4. **Docker Compose** : PostgreSQL 16 + **MinIO** (stockage S3 local) — l'environnement de développement est déjà portable (ADR-021).
5. Drizzle + `drizzle.config.ts` + première migration vide.
6. Vitest + Testcontainers + Playwright configurés, un test vert par niveau.
7. GitHub Actions : `typecheck → lint → unit → integration → build → e2e`.
8. next-intl : routage `/[locale]`, `fr.json` / `en.json`, **test de parité des clés**.
9. Sentry, logs pino, variables d'environnement validées par Zod au démarrage.
10. **`Dockerfile` multi-étapes** produisant une image exécutable partout (ADR-021).
11. **Règles de dépendance vérifiées en CI** : `app → modules → db|lib`, et aucun SDK d'infrastructure hors `src/lib/storage` / `src/lib/mail`.
12. `CLAUDE.md` + `docs/` versionnés.

✅ **Sortie** : `pnpm verify` est vert. Un `/fr` et un `/en` s'affichent. La CI bloque sur une clé i18n manquante
et sur une violation de frontière de module. L'image Docker démarre et répond.

---

## LOT 1 — Tenancy, authentification, RLS 🔒
**But** : la sécurité d'abord, jamais après. C'est le lot le plus important du projet.

1. Schéma : `organizations`, `users`, `memberships`, `invitations`, `client_user_access`, `subscriptions` + tables Better Auth.
2. Rôles PostgreSQL `app_user`, `app_portal`, `app_migrator` ; schéma `portal` ; migration RLS écrite à la main.
3. `src/db/tenant.ts` : `withTenant()` — **seul** export donnant accès à la base. Deux pools.
4. Better Auth : inscription, connexion, vérification e-mail, réinitialisation, lien magique, session en base.
5. Invitations : envoi, acceptation, expiration, révocation.
6. `src/lib/permissions` : type `Permission`, matrice `PERMISSIONS`, `can()`.
7. `src/server/action.ts` et `query.ts` : `defineAction` / `defineQuery`.
8. Sélecteur d'organisation, `active_organization_id` en session.
9. `audit_logs` + écriture automatique depuis `defineAction`.
10. Back-office Super Admin minimal : liste des organisations, suspension, journal d'audit.
11. Paramètres utilisateur : **langue d'interface, langue de reporting**, fuseau, format de date.

🔒 **Tests obligatoires**
- Générateur de tests d'isolation parcourant le schéma : pour chaque table, org A ≠ org B sur `SELECT/INSERT/UPDATE/DELETE`.
- Test « RLS activée et forcée » sur chaque table applicative — **échoue si une table est ajoutée sans politique**.
- Test de fuite de contexte : 50 requêtes concurrentes multi-tenants sur le même pool, aucun croisement.
- Test d'architecture : aucun fichier hors `tenant.ts` n'importe le client de base.
- Matrice de permissions : table-driven, confrontée au §3.2 du cahier des charges.

✅ **Sortie** : deux organisations coexistent et sont démontrablement étanches. **Aucun lot ne démarre sans ce vert.**

---

## LOT 2 — Design system & shell applicatif
1. Jetons, typographie, échelle d'espacement, rayons, ombres, états de focus.
2. Primitives possédées (bouton, champ, select, modale) — philosophie shadcn, substrat `<dialog>` natif (ADR-031).
3. `components/patterns` : `PageHeader`, `EmptyState`, `StatusBadge`, `PriorityChip`, `ProgressRing`,
   `DataTable`, `FilterBar`, `SheetForm`, `ConfirmDialog`, `AvatarStack`, `Timeline`.
4. `AppShell` : navigation **calculée depuis les permissions**, barre inférieure mobile, palette de commandes (`⌘K`).
5. Sélecteur de langue, formats `Intl` (fuseau et devise), squelettes, frontière d'erreur localisée.
6. Page de revue visuelle `/dev/design` listant tous les composants.
7. Contraste de la palette **vérifié par un test** lisant `globals.css` (ADR-032) + scan `axe` en E2E.

**Reportés, avec leur premier appelant réel** — un composant naît à sa troisième occurrence, pas à sa
première supposition (`CLAUDE.md` règle 8) :
- `MetricTile`, `DeltaIndicator` → **LOT 7** (résultats et écarts aux objectifs) ;
- `PortalShell` → **LOT 9**, avec les routes du portail. Une coquille sans route n'est testable par rien.

✅ **Sortie** : un écran type se compose sans écrire de CSS. Zéro violation `axe` sur tous les écrans
existants, galerie comprise. Respect de la règle du jaune vérifiable sur `/dev/design`.

---

## LOT 3 — Clients · *critère MVP 1* — ✅ **terminé**
1. ✅ Schéma `clients`, `client_contacts`, `client_user_access`, `files` + RLS + isolation générée.
2. ✅ Taxonomies : secteurs d'activité (`industries`, seed système idempotent).
3. ✅ CRUD client, upload de logo — `files` + `StorageAdapter` (filesystem **et** S3, mêmes tests — ADR-037).
4. ✅ Liste (recherche insensible aux accents, filtre statut) + fiche client à onglets.
5. ✅ `activity_events` + `Timeline` branchée sur l'historique client.
6. ✅ Invitation d'un contact au portail (`membership` rôle `client` + `client_user_access` — ADR-035).
7. ✅ **Contact multi-comptes** (ADR-023) : plusieurs comptes clients, plusieurs organisations, un accès qui s'ajoute au lieu d'échouer. Testé en intégration.

✅ **Sortie** : E2E « créer un client » ✅ FR + EN, plus la frontière (une organisation ne voit pas
les clients d'une autre, un contact client reçoit 404 sur l'espace interne) et le logo servi par un
lien qui expire.

---

## LOT 4 — Projets · *critères MVP 2, 6*
1. Schéma `projects`, `project_members`, `milestones` + RLS + isolation.
2. CRUD projet (client, dates, responsable, membres, priorité, budget, couleur, statut).
3. **Portée collaborateur** : `project_members` filtre effectivement les lectures — testé.
4. Liste des projets (cartes + tableau), filtres, tri par santé / échéance.
5. Écran projet : en-tête, progression, compteurs, onglets.
6. Jalons.
7. Service `progress` (pur) + compteurs dénormalisés maintenus en transaction.

✅ **Sortie** : E2E « créer un projet, y ajouter des membres, voir sa progression ».

---

## LOT 5 — Actions & My Work · *critères MVP 4, 5, 6*
1. Schéma `actions`, `action_collaborators` + taxonomies `action_types` / `categories` / `channels` + seed.
2. CRUD action, **création rapide** (titre + responsable + deadline, le reste en valeurs par défaut intelligentes).
3. Vues : liste, **kanban** par statut, groupement par responsable / priorité.
4. **My Work** : mes actions, aujourd'hui / cette semaine / en retard.
5. **Focus Mode** : les 3 à 5 actions prioritaires, une par écran.
6. Commentaires (`comments`, visibilité interne par défaut) + mentions + pièces jointes.
7. Service `overdue` (pur, testé sur plusieurs fuseaux — R9).
8. Transitions d'état validées côté service.

✅ **Sortie** : E2E « créer, assigner, suivre l'avancement d'une action » + parcours mobile collaborateur.

---

## LOT 6 — Objectifs · *critère MVP 3*
1. Schéma `objectives` + taxonomie `objective_types` + seed.
2. CRUD objectif : type, métrique, cible, unité, **devise** (ADR-024 : stockage + affichage, pas de conversion), période, responsable.
3. Écran « Objectifs » du projet : `Objectif → Résultat réel → Écart → Analyse` (colonne « réel » vide à ce stade).
4. Service `gap` (pur, testé) : écart, % d'atteinte, direction de la métrique. **Refuse de calculer un écart entre deux devises différentes** et le signale (ADR-024).
5. Catalogue `metrics` + seed des 24 métriques, y compris les métriques dérivées.

✅ **Sortie** : E2E « définir les objectifs d'un projet ».

---

## LOT 7 — Résultats & formulaires intelligents · *critère MVP 9* ⭐
**Le lot qui fait de Doomee autre chose qu'un gestionnaire de tâches. Ne pas le compresser.**

1. Schéma `results`, `result_metrics`, `result_notes`, `result_form_templates`, `result_form_fields`.
2. Seed des 6 gabarits (Social Media Post, Ads Campaign, Website Build, Content Production, Event, Generic).
3. **Moteur de rendu de formulaire piloté par la base** : le gabarit est choisi selon `action.action_type_id`, les champs sont rendus dynamiquement, validés par un schéma Zod **construit à l'exécution** depuis `result_form_fields`.
4. Déclencheur `+ Add Results` proposé à la clôture d'une action (proposé, **non bloquant**).
5. Saisie qualitative : les 8 types de notes, en accordéon, aucun champ obligatoire.
6. `What did we learn?` / `What should we do next?`.
7. Service `derived-metrics` (pur) : CTR, CPC, CPL, ROAS, ROI, taux de conversion.
8. Recalcul de `objectives.current_value` dans la même transaction → la colonne « Résultat réel » du lot 6 se remplit.
9. Module **Results** : vue consolidée, filtres client / projet / période / collaborateur / canal / type d'action, comparaison à la période précédente, meilleures et moins bonnes performances.
10. Vue matérialisée `result_metrics_daily` + job de rafraîchissement.

✅ **Sortie** : E2E « terminer une action → saisir des résultats → voir l'écart à l'objectif se mettre à jour ». **Le moment où le produit devient démontrable.**

---

## LOT 8 — Fichiers, livrables, validation · *critères MVP 7, 8*
1. Stockage R2 : upload par URL pré-signée, `files`, `attachments`, téléchargement contrôlé (R13).
2. Schéma `deliverables`, `deliverable_versions`, `deliverable_reviews` + taxonomie `deliverable_types`.
3. Machine à états du livrable (service pur, toutes transitions testées, transitions illégales refusées).
4. Écran livrable : aperçu, versions, historique des revues, commentaires.
5. Validation **interne** par le manager.
6. Envoi en validation client + `is_client_visible`.
7. Demande de modification → rattachement à la version + commentaire partagé + notification.

✅ **Sortie** : E2E interne du cycle livrable jusqu'à `client_review`.

---

## LOT 9 — Portail client · *critères MVP 8, 13* 🔒
**Deuxième lot critique en sécurité.**

1. `PortalShell`, routes `(portal)`, garde de rôle, **pool `app_portal`**, sélecteur d'organisation pour les contacts multi-comptes (ADR-023).
2. Politiques RLS portail sur les 15 tables exposées + **vues `portal.*` à colonnes explicites** (ADR-026) ; `REVOKE ALL ON SCHEMA public FROM app_portal`.
3. Overview : avancement, santé, prochaines étapes, notifications.
4. Projects · Deliverables (**`✓ Approve` / `↻ Request changes` + commentaire**) · Results · Reports (vide jusqu'au lot 12) · Messages (fil de commentaires partagés).
5. Parcours d'invitation client (lien magique) + définition du mot de passe.
6. Optimisation mobile prioritaire.

🔒 **Tests obligatoires**
- Pour chaque table exposée : un client ne voit ni `is_client_visible = false`, ni un autre client, ni une autre organisation.
- Un client authentifié atteignant une URL interne reçoit **404** (ne jamais confirmer l'existence).
- Aucun commentaire `internal` n'apparaît jamais dans une réponse du portail.
- Aucun champ interne n'est sérialisé vers le portail : **`health_score`** (ADR-025), budget, temps estimé/passé, compteurs de retard, charge, performance individuelle, `created_by`.
- `app_portal` n'a **aucun droit** sur le schéma `public` — test bloquant.
- Un contact des organisations A et B ne voit jamais A depuis B (ADR-023).
- Test à deux navigateurs : le manager envoie, le client valide, le manager est notifié.

✅ **Sortie** : E2E « le client valide un livrable » + « le client suit son projet ».

---

## LOT 10 — Insights & bouclage · *critère MVP 10* ⭐
1. Schéma `insights`, `insight_results`, `insight_actions` + `actions.source_insight_id`.
2. Éditeur d'insight : `What worked` / `What didn't` / `What did we learn` / `What do we recommend`.
3. Création d'un insight **depuis un résultat** (pré-rempli avec l'analyse et la recommandation existantes).
4. **« Create next action »** depuis la recommandation → action créée, liée, assignable en un clic.
5. Écran Insights : par projet, par client, par période.
6. Visualisation de la boucle sur l'écran projet : `Objectif → Actions → Livrables → Résultats → Insights → Prochaines actions`.

✅ **Sortie** : E2E de la boucle complète — **le test qui prouve la proposition de valeur**.

---

## LOT 11 — Project Health, risques, alertes · *critère MVP 14*
1. Schéma `project_health_snapshots`, `risks`.
2. Service `health` (pur) : 8 facteurs, pondérations issues de `organizations.settings`, score 0–100, statut.
3. **Explication localisée** : `code` + `params` → phrase FR/EN. Testée dans les deux langues.
4. Composant `HealthScore` (score, statut, facteurs dépliables) — **écrans internes uniquement**, jamais dans `(portal)` (ADR-025).
5. CRUD risques & problèmes (niveau, impact, plan d'action, statut).
6. Centre d'alertes : retards, validations en attente, projets à risque, objectifs sous la cible.
7. Job de recalcul (planifié + à l'événement) + historique de santé.

✅ **Sortie** : E2E « identifier rapidement les retards et les risques ».

---

## LOT 12 — Reporting & export PDF · *critères MVP 11, 12*
1. Schéma `reports`, `report_sections`, `report_shares`, `report_exports`.
2. **11 fournisseurs de données de section**, un par section, testés indépendamment, dégradation gracieuse (R7).
3. Assistant de création : type → périmètre → période → **langue du rapport** → génération.
4. Éditeur de rapport : sections pré-remplies, éditables, réordonnables, activables ; **sélection de ce que voit le client**.
5. Publication → `snapshot` immuable.
6. Export PDF `@react-pdf/renderer` **en job** : polices embarquées, charte Doomee, FR/EN, notification à la fin.
7. Partage : lien sécurisé (jeton haché, expiration, révocation, mot de passe optionnel), page `/share/[token]` `noindex`.
8. Publication vers le portail client (onglet Reports du lot 9).
9. Job « chaque vendredi » (reporting interne) et « fin de mois » (reporting client) : création d'un brouillon pré-rempli.

✅ **Sortie** : E2E « générer un rapport **en anglais** depuis une interface **en français**, le publier, le partager, le client le consulte ».

---

## LOT 13 — Dashboards, calendrier, équipe, recherche, réunions
1. **Dashboard Direction** : projets, équipe, performance, alertes.
2. **Dashboard Manager** : aujourd'hui, projets, équipe, reporting.
3. **Dashboard Collaborateur** : My Day, My Projects, My Results, My Progress.
4. **Calendrier** : deadlines, actions, publications, livrables, réunions, validations, jalons ; filtres client / projet / collaborateur / type / statut ; vues mois / semaine / liste.
5. **Équipe** : charge, actions assignées / terminées / en retard, respect des deadlines, résultats renseignés ; « qui est disponible / surchargé / bloqué ».
6. **Recherche globale** : `tsvector` + GIN sur 7 entités, filtres avancés, palette `⌘K`.
7. **Réunions** : avant / pendant / après, participants, décisions → actions.
8. **Fil d'activité** par projet et par client.

⚠️ **Point de vigilance R5** : chaque bloc de dashboard = **une** requête agrégée. Un test de budget de requêtes échoue au-delà de 12 requêtes par dashboard.

✅ **Sortie** : « comment va l'entreprise ? » répondu en moins de 2 secondes.

---

## LOT 14 — Notifications, automatisations, gamification
1. `notifications` + `notification_preferences` ; rendu **dans la langue du destinataire** (`type` + `params`).
2. Centre de notifications in-app, badge de non-lus.
3. E-mails React Email FR/EN : nouvelle action, deadline proche, retard, commentaire, mention, validation requise, nouveau livrable, nouveau rapport.
4. Les **7 automatisations** du cahier des charges, en jobs idempotents.
5. Gamification : `xp_events` (clé d'idempotence), niveaux, badges, section **Wins**, `XpToast` discret. Désactivable par organisation.
6. Page d'état des jobs pour le Super Admin (R12).

✅ **Sortie** : un collaborateur est notifié, motivé, jamais spammé. Préférences respectées.

---

## LOT 15 — Durcissement & mise en production
1. Audit de sécurité : CSP, en-têtes, limitation de débit, validation MIME, jetons, sessions.
2. Repasse complète des tests d'isolation et de fuite portail.
3. Performance : budget de requêtes, index, `EXPLAIN` sur les 10 requêtes les plus lourdes, test de charge confirmant la cible ADR-022 (100 organisations × 10 projets × 100 actions, ~300 000 `result_metrics`).
3b. **Portabilité vérifiée** (ADR-021) : l'image Docker démarre sur un second hébergeur, `pg_dump`/`pg_restore` testés, `StorageAdapter` et `MailAdapter` validés sur leurs deux implémentations.
4. Accessibilité : `axe` sur tous les écrans, parcours clavier complet, lecteur d'écran sur le portail.
5. Repasse i18n : relecture humaine FR et EN, aucune clé manquante, aucune chaîne en dur.
6. RGPD : export et suppression des données d'une organisation, politique de conservation.
7. Sauvegardes PITR, procédure de restauration **testée**.
8. Seed de démonstration + parcours d'onboarding.
9. **Recette des 15 critères de réussite du MVP**, en FR et en EN, sur mobile et desktop.
10. Documentation d'exploitation, page d'état, alertes Sentry.

✅ **Sortie** : mise en production.

---

## 3. Chemin critique et parallélisation

```
LOT 0 ─► LOT 1 ─► LOT 2 ─► LOT 3 ─► LOT 4 ─► LOT 5 ─► LOT 6 ─► LOT 7 ⭐
                                                                    │
                                       ┌────────────────────────────┴───────┐
                                       ▼                                    ▼
                                  LOT 8 ─► LOT 9 🔒                   LOT 10 ⭐ ─► LOT 11
                                       │                                    │
                                       └──────────────┬─────────────────────┘
                                                      ▼
                                                  LOT 12 ─► LOT 13 ─► LOT 14 ─► LOT 15
```

| Jalon démontrable | Après | Ce qu'on peut montrer |
|---|---|---|
| **Démo 1 — « on gère »** | LOT 6 | Client, projet, objectifs, actions, avancement |
| **Démo 2 — « on mesure »** ⭐ | LOT 7 | La saisie de résultats et l'écart aux objectifs |
| **Démo 3 — « le client voit »** | LOT 9 | Le portail client et la validation de livrables |
| **Démo 4 — « la boucle »** ⭐ | LOT 10 | Objectif → … → Prochaine action, de bout en bout |
| **Démo 5 — « on montre »** | LOT 12 | Le reporting généré, en anglais, partagé au client |
| **MVP complet** | LOT 15 | Les 15 critères |

> Si un arbitrage de délai doit être fait, **les lots 7, 9, 10 et 12 ne se coupent pas** :
> ce sont eux qui différencient Doomee. On coupe plutôt dans 13 (calendrier réduit à une vue liste)
> et 14 (gamification limitée aux Wins).

---

## 4. Après le MVP

| Vague | Contenu |
|---|---|
| **V2.0** | Export Excel/CSV · suivi du temps · budgets & rentabilité · notifications avancées · automatisations configurables |
| **V2.1** | IA de reporting (résumé exécutif, analyse, insights, recommandations — éditables et validés par un humain) |
| **V2.2** | **Ask Doomee** (questions en langage naturel) · recommandations automatiques · détection prédictive des retards |
| **V2.3** | Intégrations : Meta, Google Ads, LinkedIn, GA4 · synchronisation calendrier · SSO |
| **V3** | Business Intelligence · benchmarks · API publique · copilote de pilotage · multi-organisations |
