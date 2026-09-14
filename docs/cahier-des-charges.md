# Doomee — Cahier des charges consolidé

> **Version** : 1.0 (analyse) · **Source** : `Cahier_de_charge_Doomee.pdf` v1.0 (36 pages)
> **Statut** : proposition en attente de validation
> **Signature produit** : *Do. Track. Show.* · **Promesse** : *Turn work into visible results.*

Ce document est la **traduction opérationnelle** du cahier des charges fonctionnel.
Il fige le périmètre, les rôles, les permissions et les flux.
Il fait autorité sur le « quoi ». `docs/architecture.md` fait autorité sur le « comment ».

---

## 1. Le principe central (non négociable)

```
OBJECTIF → ACTION → LIVRABLE → RÉSULTAT → ANALYSE → INSIGHT → RECOMMANDATION → PROCHAINE ACTION
```

Cette boucle est **le produit**. Tout le reste est de la plomberie.

Conséquences concrètes de conception :

| Principe | Implication technique |
|---|---|
| Toute action terminée doit mener quelque part | Une action passée à `done` déclenche une invitation à saisir un résultat |
| Tout résultat doit pouvoir être interprété | `results.analysis` (*What did we learn?*) et `results.recommendation` (*What should we do next?*) sont des champs de premier ordre |
| Toute recommandation doit pouvoir devenir du travail | Un insight génère une action en un clic (`insight_actions`) |
| Tout objectif doit être comparable au réel | `Objectif → Résultat réel → Écart → Analyse` calculé, jamais ressaisi |

**Test de non-régression produit** : si une fonctionnalité n'aide pas à parcourir cette boucle, elle n'est pas prioritaire.

---

## 2. Problème résolu

Dispersion du suivi projet (WhatsApp, e-mail, Excel, Drive, Trello, Word, fichiers de reporting, échanges clients) →
perte d'information, invisibilité de l'avancement réel, retards non anticipés, reportings chronophages, impact non mesuré,
relances clients permanentes.

**Doomee centralise et transforme la donnée opérationnelle en information exploitable.**

---

## 3. Rôles utilisateurs et permissions

### 3.1. Les six acteurs

| Rôle | Portée | Nature |
|---|---|---|
| `platform_admin` (Super Admin) | **Toute la plateforme**, hors organisation | Exploitant Doomee |
| `owner` | Une organisation | Propriétaire du compte (facturation, suppression) |
| `direction` | Une organisation | Lecture globale + objectifs + risques |
| `manager` | Une organisation, projets qu'il pilote | Project / Account Manager |
| `collaborator` | Projets auxquels il est affecté | Exécutant |
| `client` | **Uniquement** les clients qui lui sont rattachés | Externe, portail dédié |

> **Note d'écart avec le PDF** : le PDF liste 5 rôles. Nous scindons « Direction » en `owner` + `direction`
> car la facturation / suppression d'organisation / gestion des sièges ne peut pas reposer sur le Super Admin
> (qui est l'exploitant de la plateforme, pas le client). Voir ADR-012.

### 3.2. Matrice de permissions (MVP)

Légende : ✅ complet · 🟡 limité (voir note) · ❌ aucun · — sans objet

| Capacité | platform_admin | owner | direction | manager | collaborator | client |
|---|---|---|---|---|---|---|
| **Organisations** |
| Créer / suspendre une organisation | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Voir toutes les organisations | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gérer abonnement / sièges | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Paramètres de l'organisation | ✅ | ✅ | 🟡 lecture | ❌ | ❌ | ❌ |
| Taxonomies (types d'action, canaux, métriques) | ✅ | ✅ | 🟡 lecture | 🟡 créer | ❌ | ❌ |
| **Utilisateurs** |
| Inviter / désactiver un membre interne | ✅ | ✅ | ❌ | 🟡 collaborateurs | ❌ | ❌ |
| Changer le rôle d'un membre | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Inviter un contact client au portail | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Clients** |
| Créer / modifier un client | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Voir la fiche client | ✅ | ✅ | ✅ | 🟡 ses clients | 🟡 via projet | 🟡 le sien |
| Supprimer / archiver un client | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Projets** |
| Créer un projet | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier un projet | ✅ | ✅ | 🟡 statut | 🟡 ses projets | ❌ | ❌ |
| Voir tous les projets de l'org | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Voir un projet | ✅ | ✅ | ✅ | ✅ | 🟡 membre | 🟡 client-visible |
| Archiver / supprimer | ✅ | ✅ | ❌ | 🟡 ses projets | ❌ | ❌ |
| **Objectifs** |
| Créer / modifier un objectif | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Voir les objectifs | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | 🟡 client-visible |
| **Actions** |
| Créer / assigner une action | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Modifier n'importe quelle action | ✅ | ✅ | ❌ | 🟡 ses projets | ❌ | ❌ |
| Modifier **ses** actions (statut, temps, PJ) | ✅ | ✅ | — | ✅ | ✅ | ❌ |
| Voir les actions | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | 🟡 client-visible |
| **Résultats** |
| Saisir un résultat | ✅ | ✅ | ❌ | ✅ | ✅ sur ses actions | ❌ |
| Modifier un résultat | ✅ | ✅ | ❌ | ✅ | 🟡 les siens | ❌ |
| Voir les résultats consolidés | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | 🟡 client-visible |
| **Livrables** |
| Créer / téléverser une version | ✅ | ✅ | ❌ | ✅ | ✅ sur ses actions | ❌ |
| Validation **interne** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Envoyer en validation client | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Approuver / demander modification** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Commentaires** |
| Commentaire interne | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Commentaire partagé avec le client | ✅ | ✅ | ✅ | ✅ | 🟡 | ✅ |
| **Insights** |
| Créer / modifier un insight | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | ❌ |
| Convertir en action | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Reporting** |
| Générer un reporting | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publier / partager au client | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Consulter un reporting | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | 🟡 publiés |
| Exporter PDF | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 publiés |
| **Risques** |
| Créer / modifier un risque | ✅ | ✅ | ✅ | ✅ | 🟡 signaler | ❌ |
| Voir les risques | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | 🟡 client-visible |
| **Équipe / performance** |
| Dashboard équipe (charge, retards, perf) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Voir la performance individuelle d'autrui | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Journal** |
| Journal d'activité projet | ✅ | ✅ | ✅ | ✅ | 🟡 ses projets | 🟡 client-visible |
| Journal d'audit sécurité | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### 3.3. Règles de portée transverses

1. **Isolation organisation** — aucune requête ne franchit jamais la frontière `organization_id`. Garanti par RLS PostgreSQL (voir `docs/architecture.md` §6).
2. **Portée collaborateur** — un `collaborator` ne voit que les projets où il est membre (`project_members`).
3. **Portée client** — un `client` ne voit que les `clients` auxquels il est rattaché (`client_user_access`), et à l'intérieur uniquement les entités marquées `is_client_visible = true`.
4. **Le client ne voit jamais** : notes internes, commentaires internes, charge d'équipe, performance individuelle, temps passé, budget interne, risques non partagés, actions non partagées, reportings non publiés, autres clients.
5. **`platform_admin` n'est pas un rôle d'organisation** — il opère la plateforme. Tout accès aux données d'une organisation est journalisé dans `audit_logs` et doit être explicitement assumé (mode support tracé).
6. **Menu dépendant du rôle** — la navigation est calculée à partir des permissions, jamais codée en dur par rôle.

### 3.4. Navigation par rôle

| Entrée de menu | owner / direction | manager | collaborator | client |
|---|---|---|---|---|
| Home | ✅ | ✅ | ✅ | Overview |
| My Work | ✅ | ✅ | ✅ | ❌ |
| Projects | ✅ | ✅ | ✅ (les siens) | ✅ (les siens) |
| Results | ✅ | ✅ | 🟡 les siens | ✅ (client-visible) |
| Insights | ✅ | ✅ | 🟡 | ❌ |
| Reports | ✅ | ✅ | 🟡 | ✅ (publiés) |
| Deliverables | via projet | via projet | via projet | ✅ (à valider) |
| Clients | ✅ | ✅ | ❌ | ❌ |
| Team | ✅ | ✅ | ❌ | ❌ |
| Calendar | ✅ | ✅ | ✅ | 🟡 jalons partagés |
| Messages | — | — | — | ✅ |
| Settings | ✅ | 🟡 perso | 🟡 perso | 🟡 perso |

---

## 4. Périmètre MVP

### 4.1. Inclus — 12 modules

#### M1 — Comptes, organisations, rôles
- Inscription, connexion, mot de passe oublié, vérification e-mail.
- Création d'organisation, invitation de membres avec rôle, acceptation d'invitation.
- Paramètres utilisateur : **langue d'interface**, **langue de reporting**, fuseau horaire, format de date, préférences de notification.
- Profil, avatar, désactivation d'un membre.
- Back-office Super Admin : liste des organisations, statut, sièges, suspension, journal d'audit.

#### M2 — Clients
- CRUD client : nom, logo, secteur, description, contacts, responsable côté client, équipe interne responsable, coordonnées, statut.
- Fiche client agrégée : informations, projets, actions, livrables, résultats, reportings, réunions, documents, historique, commentaires.
- Historique client (fil d'événements filtrable).
- Invitation d'un contact client au portail.

#### M3 — Projets
- CRUD projet : nom, client, description, dates, responsable, membres, priorité, budget, statut, couleur.
- Statuts : `to_start`, `in_progress`, `in_review`, `paused`, `blocked`, `done`, `archived`.
- Jalons (milestones).
- Indicateurs projet : % d'avancement, nb d'actions, terminées, en retard, livrables, validations, résultats, objectifs atteints, risques.

#### M4 — Project Health
- Score `0–100` + statut `HEALTHY` / `AT RISK` / `BLOCKED`.
- Facteurs : avancement, respect des deadlines, actions en retard, validations en attente, risques ouverts, charge, dépendances, progression vs calendrier.
- **Explication obligatoire** : chaque score s'accompagne des facteurs contributifs en langage naturel, localisés.
- Recalcul planifié + à l'événement, historisé (`project_health_snapshots`).

#### M5 — Actions
- CRUD action : titre, description, projet, responsable, collaborateurs, priorité, dates, statut, catégorie, canal, type d'action, temps estimé / passé, pièces jointes, commentaires.
- Statuts : `todo`, `in_progress`, `in_review`, `done`, `blocked`, `cancelled`.
- Priorités : `low`, `normal`, `high`, `urgent`.
- Vues : liste, kanban, calendrier, **My Work**, **Focus Mode**.
- Assignation multiple, drapeau de visibilité client.

#### M6 — Objectifs
- CRUD objectif rattaché à un projet : type, métrique cible, valeur cible, unité, période, responsable.
- Types : business, marketing, communication, commercial, opérationnel, financier (**données, pas du code**).
- Vue comparative `Objectif → Résultat réel → Écart → Analyse`, calculée depuis les résultats.

#### M7 — Résultats et formulaires intelligents
- `+ Add Results` proposé à la clôture d'une action.
- **Formulaire adapté au type d'action**, piloté par des gabarits en base (`result_form_templates`), pas par du code.
  Exemples livrés en seed : *Publication Social Media*, *Campagne Ads*, *Création de site web*.
- Quantitatif : métriques normalisées (impressions, portée, vues, réactions, commentaires, partages, clics, CTR, leads, RDV, ventes, CA, taux de conversion, budget dépensé, CPL, ROI, ROAS, trafic…), y compris **métriques dérivées** (CTR = clics/impressions).
- Qualitatif : observations, retours public, retours client, difficultés, points positifs, points négatifs, enseignements, opportunités.
- `What did we learn?` (analyse) et `What should we do next?` (recommandation).

#### M8 — Livrables et validation client
- Types : image, vidéo, document, présentation, article, script, fichier graphique, lien, site web, autre (**données**).
- Workflow : `draft → production → internal_review → client_review → changes_requested → approved → published`.
- Versionnage des fichiers, comparaison de versions (liste).
- **Le client** : `✓ Approve` ou `↻ Request changes` + commentaire, rattaché automatiquement au livrable et à la version concernée.
- Une demande de modification rouvre le livrable et notifie le responsable.

#### M9 — Insights
- `What worked?` / `What didn't?` / `What did we learn?` / `What do we recommend?`.
- Rattachement à un projet, un client, une période, un ou plusieurs résultats.
- **Next action** : création directe d'une action depuis la recommandation, lien conservé.

#### M10 — Reporting
- Types : hebdomadaire interne, mensuel, projet, client, bilan de campagne, bilan de période.
- Structure en 11 sections (résumé exécutif, objectifs, actions réalisées, livrables, résultats, comparaison aux objectifs, analyse, insights, points d'attention, recommandations, prochaines étapes).
- **Pré-alimentation automatique** depuis les données existantes ; l'utilisateur vérifie, complète, contextualise, valide.
- Sélection des sections visibles par le client.
- **Langue du rapport indépendante de la langue d'interface.**
- Export PDF, partage par lien sécurisé, envoi au client.
- Snapshot immuable à la publication.

#### M11 — Pilotage : dashboards, calendrier, notifications, activité, recherche
- Dashboard Direction, Manager, Collaborateur, Client (contenus spécifiés au §5).
- Calendrier : deadlines, actions, publications, livrables, réunions, validations, jalons ; filtres client / projet / collaborateur / type / statut.
- Notifications in-app + e-mail, par rôle (collaborateur, manager, client), avec préférences.
- Fil d'activité par projet et par client.
- Recherche globale (client, projet, action, livrable, résultat, utilisateur, reporting) + filtres avancés.
- Risques & problèmes : titre, description, projet, niveau (🟢 faible / 🟠 moyen / 🔴 critique), impact, responsable, date, plan d'action, statut.
- Module Équipe : actions assignées / terminées / en retard, charge, projets, respect des deadlines, résultats renseignés ; « qui est disponible / surchargé / bloqué ».
- Réunions : avant (participants, ordre du jour, objectifs), pendant (notes, décisions, problèmes), après (compte rendu, décisions, actions, responsables, deadlines) ; **une décision devient une action**.

#### M12 — Portail client
- Dashboard : projets actifs, avancement global, actions en cours, livrables à valider, résultats, derniers reportings, prochaines étapes, notifications.
- Onglets : Overview, Projects, Deliverables, Results, Reports, Messages.
- Cloisonnement strict (§3.3).

#### Transverse — i18n FR/EN
- Interface, menus, boutons, notifications, statuts, formulaires, messages, e-mails, reportings.
- Langue par utilisateur ; deux utilisateurs d'un même projet peuvent être dans des langues différentes.
- Langue de reporting indépendante.

#### Transverse — Gamification légère
- XP, niveaux, progression, badges, section **Wins**, célébrations ponctuelles.
- Barème par défaut en seed, **configurable par organisation** : `+10` action terminée, `+15` deadline respectée, `+20` résultat renseigné, `+100` projet terminé.
- Désactivable au niveau organisation (certains clients n'en voudront pas).

#### Transverse — Automatisations de base
Uniquement les 7 règles listées au §30 du PDF, câblées en dur comme *règles nommées* (pas de moteur de règles) :
action terminée → demander les résultats · livrable prêt → notifier le client · livrable validé → clôturer l'étape ·
deadline proche → notifier · projet en risque → alerter le manager · chaque vendredi → préparer le reporting interne ·
fin de mois → préparer le reporting client.

### 4.2. Reporté en V2

| Fonctionnalité | Raison du report |
|---|---|
| **Ask Doomee** (NL → requête) | Nécessite un socle de données stable et un budget d'évaluation |
| **IA de rédaction de reporting** (résumé exécutif, analyse, points forts/faibles, insights, risques, recommandations) | Le MVP doit prouver que les données brutes suffisent déjà. L'IA doit augmenter une structure existante, pas la créer |
| Recommandations automatiques | Idem |
| Détection prédictive des retards | Requiert un historique (≥ 3 mois de données réelles) |
| Automatisations avancées / moteur de règles configurable | Le MVP couvre les 7 règles nommées |
| Gestion avancée des ressources (capacité, planification) | Dépasse la boucle centrale |
| **Suivi du temps** (timer, feuilles de temps) | Le MVP garde `estimated_minutes` / `spent_minutes` saisis à la main |
| **Budgets & rentabilité** | Le MVP garde un montant de budget informatif, sans calcul de marge |
| Intégrations externes (Meta, Google Ads, LinkedIn, GA4) | Chaque connecteur est un projet à part entière. Le MVP prouve la valeur avec la saisie manuelle assistée |
| Synchronisation calendrier (Google / Outlook) | — |
| Notifications avancées (Slack, WhatsApp, digest configurable) | Le MVP fait in-app + e-mail |
| Export Excel / CSV | **PDF seul au MVP** ; XLSX/CSV en V2 (l'infrastructure d'export est prévue dès le MVP) |
| Messagerie temps réel du portail client | Le MVP utilise des fils de commentaires partagés, pas un chat |
| Traduction automatique du contenu utilisateur | Seule l'interface + la structure des rapports sont traduites au MVP |
| Sous-tâches, dépendances inter-actions, Gantt | Non demandés explicitement ; complexifient le modèle |
| Paiement en ligne / self-serve billing | Abonnements gérés manuellement par le Super Admin au MVP |
| SSO / SAML, 2FA obligatoire | 2FA optionnelle possible dès le MVP via Better Auth ; SSO entreprise en V2 |
| Application mobile native | Le MVP est **responsive-first** et installable (PWA) |

### 4.3. Vision V3

Plateforme complète de pilotage d'entreprise : Project Management · Performance Management · Client Portal ·
**Business Intelligence** (entrepôt analytique, tableaux croisés, benchmarks inter-clients anonymisés) ·
**AI Assistant** (copilote de pilotage). API publique + marketplace d'intégrations. Multi-organisations / groupes.

> *« Doomee ne doit plus seulement être l'endroit où l'on gère le travail, mais l'endroit où l'on comprend la performance du travail. »*

---

## 5. Contenu des dashboards

### 5.1. Direction — « Comment va l'entreprise ? » en quelques secondes
- **Projets** : actifs · terminés · à risque · bloqués.
- **Équipe** : charge · performance · actions · retards.
- **Performance** : objectifs · résultats · évolution · meilleures performances.
- **Alertes** : retards · validations en attente · risques · objectifs non atteints.

### 5.2. Manager
- **Aujourd'hui** : actions prioritaires · deadlines · validations · problèmes.
- **Projets** : progression · santé · retards.
- **Équipe** : charge · tâches · performance.
- **Reporting** : reportings à préparer · données manquantes · résultats à renseigner.

### 5.3. Collaborateur
- **My Day** : mes actions · mes deadlines · mes priorités.
- **My Projects** · **My Results** · **My Progress** (actions terminées, progression, XP, Wins).

### 5.4. Client
- **Overview** : avancement · santé du projet · résultats · prochaines étapes.
- **Projects** · **Deliverables** (livrables + validations) · **Results** (KPI) · **Reports** · **Messages**.

---

## 6. Flux utilisateurs principaux

### F1 — Onboarding d'une organisation
`Inscription → vérification e-mail → création de l'organisation (nom, logo, langue par défaut, fuseau) →
invitation des membres → choix des taxonomies par défaut (seed) → création du premier client`

Objectif : **< 5 minutes** jusqu'au premier projet. Tout est pré-rempli au maximum (*smart defaults*).

### F2 — Mise en place d'un projet (Manager)
`Client → Nouveau projet (nom, dates, responsable, membres, priorité, couleur) →
Objectifs (type, métrique, cible, période) → Actions (titre, responsable, deadline, type d'action) → Jalons`

Le type d'action choisi ici détermine le formulaire de résultats plus tard. C'est le seul champ « intelligent » exigé à la création.

### F3 — Journée d'un collaborateur
`Login → My Day (actions du jour triées par priorité et deadline) → [Focus Mode] → ouvrir une action →
mettre à jour le statut → commenter / joindre un fichier → passer à "done"`

### F4 — La boucle de valeur (le flux le plus important)
```
Action passée à "done"
   └─► Doomee propose : « + Add Results »
         └─► Formulaire intelligent selon le type d'action
               ├─ Quantitatif  (métriques pré-listées, unités pré-remplies)
               └─ Qualitatif   (observations, retours, difficultés, enseignements…)
         └─► « What did we learn? »        → results.analysis
         └─► « What should we do next? »   → results.recommendation
               └─► Doomee propose : « Create insight » ou « Create next action »
                     └─► Insight (What worked / What didn't / Learned / Recommend)
                           └─► « Next action » → nouvelle action liée à l'insight
                                 └─► L'écart vs objectif est recalculé automatiquement
```
**Règle UX** : aucune de ces étapes n'est bloquante, toutes sont proposées. On réduit la friction, on ne l'impose pas.

### F5 — Cycle de vie d'un livrable
```
Collaborateur : crée le livrable (draft) → téléverse la v1 (production)
Manager       : validation interne (internal_review) → ✓ ou ↻
Manager       : envoie au client (client_review)   → notification client
Client        : ✓ Approve                → approved → (publish)
             ou ↻ Request changes + commentaire → changes_requested
                     └─► notification au responsable, commentaire rattaché à la version
                     └─► nouvelle version → retour en client_review
```

### F6 — Génération et partage d'un reporting
```
Manager : Reports → New report
   → type (client / projet / mensuel / campagne…), périmètre (client ou projet), période
   → LANGUE DU RAPPORT (indépendante de l'interface)
   → Doomee pré-remplit les 11 sections depuis les données existantes
   → Le manager édite le résumé exécutif, l'analyse, les recommandations
   → Sélection des sections visibles par le client
   → Publier  → snapshot immuable + export PDF
   → Partager → lien sécurisé (expiration, révocable) ou notification portail client
```

### F7 — Parcours client
```
Invitation e-mail → définition du mot de passe → Portail
   Overview : avancement, santé, prochaines étapes
   Deliverables : « 2 livrables attendent votre validation » → Approve / Request changes
   Results : les KPI qui le concernent
   Reports : les reportings publiés → consultation + PDF
   Messages : fil d'échange rattaché au projet
```
Le client ne voit **jamais** d'information interne. Aucun lien, aucune miette, aucune fuite par compte de résultats.

### F8 — Détection des retards et risques (Manager / Direction)
`Home → Alertes → actions en retard, validations en attente > N jours, projets AT RISK / BLOCKED, objectifs sous la cible →
clic → contexte complet → créer un risque ou réassigner`

### F9 — De la réunion à l'action
`Réunion (participants, ordre du jour, objectifs) → notes, décisions, problèmes →
compte rendu → « Convertir la décision en action » → action assignée avec deadline`

---

## 7. Principes UX à respecter en permanence

1. **Less typing** — ne demander que le nécessaire. Tout champ ajouté doit se justifier.
2. **One thing at a time** — pas d'écran surchargé ; formulaires progressifs.
3. **Show progress** — la progression est toujours visible (barres, scores, streaks, Wins).
4. **Smart defaults** — Doomee pré-remplit tout ce qu'il peut (dates, responsable, type, unités, période).
5. **Every action leads somewhere** — chaque écran termine sur une action suivante possible.

Contraintes complémentaires imposées par le commanditaire :
mobile-friendly et responsive · expérience moderne, fun, professionnelle, motivante ·
le client suit son projet sans jamais accéder à l'interne · multi-tenant dès le départ · FR/EN.

---

## 8. Identité visuelle

| Jeton | Valeur | Usage |
|---|---|---|
| `--doomee-yellow` | `#FFD21F` | **Action et énergie uniquement** : CTA principal, progression atteinte, célébration. Jamais en fond large |
| `--doomee-black` | `#111111` | Texte principal, en-têtes, surfaces inversées |
| `--background` | `#FAFAF7` | Fond d'application |
| `--surface` | `#FFFFFF` | Cartes, panneaux, modales |
| `--border` | `#E8E8E3` | Séparateurs, contours |
| `--success` | `#22A06B` | Terminé, validé, objectif atteint, HEALTHY |
| `--danger` | `#E5484D` | Erreur, en retard, bloqué, critique |
| `--warning` | `#F59E0B` | Attention, AT RISK, échéance proche, niveau moyen |

**Personnalité** : simple · fun · smart · dynamique · professionnelle · humaine.
**Règle du jaune** : maximum un élément jaune dominant par écran. Le jaune signale *« c'est ici que ça se passe »*.

---

## 9. Critères de réussite du MVP

Le MVP est réussi si une équipe peut, de bout en bout :

| # | Critère | Module |
|---|---|---|
| 1 | Créer un client | M2 |
| 2 | Créer un projet | M3 |
| 3 | Définir ses objectifs | M6 |
| 4 | Créer des actions | M5 |
| 5 | Assigner les actions | M5 |
| 6 | Suivre leur avancement | M3/M5 |
| 7 | Ajouter les livrables | M8 |
| 8 | Faire valider les livrables | M8/M12 |
| 9 | Enregistrer les résultats | M7 |
| 10 | Analyser les résultats | M7/M9 |
| 11 | Générer un reporting | M10 |
| 12 | Partager le reporting avec le client | M10/M12 |
| 13 | Permettre au client de suivre son projet | M12 |
| 14 | Identifier rapidement retards et risques | M4/M11 |
| 15 | Utiliser l'application en français ou en anglais | i18n |

> **Indicateur unique** : *un manager doit pouvoir comprendre l'état de ses projets sans demander un reporting manuel
> à chaque collaborateur, et un client doit pouvoir comprendre l'avancement de son projet sans relancer personne.*

Ces 15 critères sont implémentés comme **scénarios Playwright**, exécutés en FR et en EN. Voir `docs/architecture.md` §10.

---

## 10. Écarts et décisions ouvertes

| # | Sujet | Proposition | À valider |
|---|---|---|---|
| E1 | Export Excel/CSV | Reporté en V2, PDF seul au MVP | ⬜ |
| E2 | Messagerie client | Fils de commentaires partagés, pas de chat temps réel | ⬜ |
| E3 | Suivi du temps | Champs manuels au MVP, pas de timer | ⬜ |
| E4 | Rôle `owner` | Ajouté à côté de `direction` | ⬜ |
| E5 | Devise | Multi-devise par organisation (FCFA, EUR, USD) — pas de conversion au MVP | ✅ **validé** (ADR-024) |
| E6 | Gamification | Activable/désactivable par organisation | ⬜ |
| E7 | Contenu utilisateur bilingue | Non traduit au MVP (seuls l'UI et la structure des rapports le sont) | ⬜ |
| E8 | Hébergement / résidence des données | **Union Européenne** au MVP ; architecture portable, bascule possible vers l'Afrique de l'Ouest sans refonte | ✅ **validé** (ADR-021) |
