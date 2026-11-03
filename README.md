# DOOMEE — Application (MVP, phase 1)

Application web responsive de planification quotidienne, de bilan du soir, de suivi des performances et de reporting automatisé.

- **Frontend** : Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Recharts
- **Données** : Supabase (PostgreSQL, Auth, Storage) avec **Row Level Security** sur toutes les tables
- **Exports** : PDF générés côté serveur (`@react-pdf/renderer`)
- **Hébergement** : Vercel
- **Langues** : français et anglais (choix dans le profil ou sur l'écran de connexion)

Tout l'hébergement tient dans les **offres gratuites** de Supabase et de Vercel pour une équipe de quelques dizaines de personnes.

---

## Installation pas à pas (sans connaissances en code)

Comptez environ 30 minutes. Vous aurez besoin d'un compte GitHub, d'un compte Supabase et d'un compte Vercel (tous gratuits).

### Étape 1 — Créer la base de données (Supabase)

1. Allez sur **supabase.com** → *Start your project* → connectez-vous avec GitHub.
2. *New project* : nom `doomee`, choisissez un mot de passe de base de données (notez-le), région **Europe (Frankfurt ou Paris)**, puis *Create new project*. Patientez 2 minutes.
3. Dans le menu de gauche, ouvrez **SQL Editor** → *New query*.
4. Ouvrez le fichier `supabase/schema.sql` de ce projet, copiez **tout** son contenu, collez-le dans l'éditeur, puis cliquez sur **Run**. Le message *Success. No rows returned* doit s'afficher.
5. Menu **Authentication → Sign In / Providers → Email** : désactivez **Allow new users to sign up** (seul l'administrateur crée les comptes), et désactivez **Confirm email**. Enregistrez.
6. Menu **Project Settings → API** : notez
   - *Project URL* (ex. `https://abcd.supabase.co`)
   - la clé *anon public*
   - la clé *service_role* (**secrète**, ne la partagez jamais).

### Étape 2 — Créer le premier compte (administrateur)

1. Menu **Authentication → Users → Add user → Create new user**.
2. Saisissez votre e-mail et un mot de passe, cochez *Auto Confirm User*, puis *Create user*.
3. **Le tout premier compte créé devient automatiquement administrateur.** Tous les autres comptes seront créés ensuite depuis l'application (*Gestion de l'équipe*).

### Étape 3 — Mettre le code sur GitHub

1. Sur **github.com** → *New repository* → nom `doomee`, *Private* → *Create repository*.
2. Cliquez sur *uploading an existing file* et glissez-déposez **le contenu** du dossier `doomee-app` (pas le dossier lui-même, et sans `node_modules` s'il existe). Validez avec *Commit changes*.

### Étape 4 — Mettre l'application en ligne (Vercel)

1. Sur **vercel.com** → connectez-vous avec GitHub → *Add New… → Project* → importez le dépôt `doomee`.
2. Avant de cliquer sur *Deploy*, ouvrez **Environment Variables** et ajoutez :

| Nom | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | la *Project URL* de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé *anon public* |
| `SUPABASE_SERVICE_ROLE_KEY` | la clé *service_role* |
| `NEXT_PUBLIC_SITE_URL` | l'adresse du site, ex. `https://doomee.vercel.app` (à corriger après le premier déploiement si besoin) |
| `CRON_SECRET` | une longue phrase aléatoire de votre choix |

3. Cliquez sur **Deploy**. Après 2 à 3 minutes, Vercel affiche l'adresse de l'application.
4. Dans Supabase, menu **Authentication → URL Configuration** : mettez cette adresse dans *Site URL* et ajoutez `https://VOTRE-ADRESSE/auth/callback` dans *Redirect URLs* (nécessaire pour « Mot de passe oublié »).

### Étape 5 — Configurer l'organisation

Connectez-vous avec le compte administrateur, puis dans l'**Espace direction** :

1. **Paramètres** : créez les départements (Création, Social media, Business development, Gestion de projet…) et ajustez les catégories d'activités.
2. **Gestion de l'équipe** : créez chaque collaborateur (prénom, e-mail, fonction, département, rôle). Un **mot de passe provisoire** s'affiche une seule fois : transmettez-le à la personne, qui le changera dans *Mon profil*.
3. Revenez dans **Paramètres** pour désigner le **manager** de chaque département.
4. **Projets** : créez les projets et clients auxquels les actions seront rattachées.

---

## Rôles et droits (appliqués par la base de données)

| Rôle | Voit | Peut faire |
|---|---|---|
| **Collaborateur** | uniquement ses propres données | planning, bilan, budget, justificatifs, son rapport PDF, son profil |
| **Manager** | les membres des départements dont il est responsable | + rapports de son équipe, observations, relances, projets |
| **Direction** | toute l'organisation | + tous les rapports et exports |
| **Administrateur** | tout | + comptes, rôles, départements, catégories, corrections après soumission |

Les permissions ne reposent pas sur l'interface : elles sont imposées par les règles **RLS** de Supabase (`supabase/schema.sql`). Un collaborateur qui tenterait d'interroger directement l'API ne verrait que ses données.

## Fonctionnement quotidien

- **Matin — Planning** : chaque action a un intitulé, un résultat attendu, un projet, une catégorie, une priorité, une échéance, un temps estimé et, si besoin, un **budget prévu**. Une fois soumis, le planning est figé.
- **Journée** : les imprévus s'ajoutent dans le bilan, marqués « Imprévue ».
- **Soir — Bilan** : pour chaque action, statut (terminée / partielle / non réalisée), résultat obtenu, quantité, temps réel, **budget utilisé**, preuve et **reçu** en pièce jointe. Une explication est **obligatoire** pour une action partielle ou non réalisée (contrôle aussi en base).
- Après soumission, le bilan n'est plus modifiable par le collaborateur. Une correction par l'administrateur est enregistrée dans l'**historique des modifications**.

## Indicateurs

Calculés uniquement à partir des données enregistrées (`src/lib/metrics.ts`) :

- **Taux de réalisation** = actions terminées ÷ actions planifiées × 100. Les actions partielles sont affichées séparément et ne comptent pas comme terminées.
- **Respect des délais** = actions terminées dans les délais ÷ actions terminées.
- **Écart de temps** = temps réel − temps estimé.
- **Taux de reporting** = bilans soumis ÷ jours ouvrés attendus.
- **Budget** = budget utilisé vs budget prévu, et nombre de reçus joints.

Un indicateur sans données s'affiche « — » : il n'est jamais présenté comme fiable sans données.

## Notifications

- **Dans l'application** : observation d'un manager, bilan disponible pour le manager, relance d'un manager.
- **Rappels automatiques** : rappel du planning (08:00) et du bilan (17:30), heure de Douala, du lundi au vendredi, plus une alerte au manager pour les plannings manquants. Chaque collaborateur peut couper ses rappels dans *Mon profil*.
- **Rapports disponibles** : le vendredi soir, notification « rapport hebdomadaire » à chaque collaborateur (son rapport) et au management (rapport d'équipe) ; le dernier jour ouvré du mois, notification « rapport mensuel » au management. Les rapports sont calculés à la demande à partir des données : ils sont donc toujours à jour.
- **Horaires configurables** (*Paramètres*) : ils s'appliquent si les routes `/api/cron/matin` et `/api/cron/soir` (en-tête `Authorization: Bearer CRON_SECRET`) sont appelées toutes les 15 minutes (Vercel Pro ou planificateur externe) : l'envoi se fait alors à partir de l'heure réglée, une seule fois par jour. Avec l'offre gratuite de Vercel (un seul appel par jour), `vercel.json` utilise `?fixed=1` : envoi immédiat aux heures fixes du fichier.
- Les notifications par e-mail ou WhatsApp sont prévues en phase 2.

## Correspondance avec le cahier des charges

| Cahier des charges | Où dans le code |
|---|---|
| Module 1 — Authentification | `src/app/login`, `src/app/mot-de-passe-oublie`, `src/middleware.ts` |
| Module 2 — Dashboard collaborateur | `src/app/(app)/accueil` |
| Module 3 — Daily Planning | `src/app/(app)/planning` |
| Module 4 — Daily Check-out | `src/app/(app)/bilan` |
| Module 5 — My Performance | `src/app/(app)/performance` |
| Module 6 — Management Dashboard | `src/app/direction/page.tsx` |
| Module 7 — Team Performance + rapport individuel | `src/app/direction/equipe`, `src/app/direction/collaborateurs/[id]` |
| Module 8 — Reports + export PDF | `src/app/direction/rapports`, `src/app/api/rapport` |
| Module 9 — Projects | `src/app/direction/projets` |
| Module 10 — Team Management | `src/app/direction/utilisateurs` |
| Module 11 — Settings | `src/app/direction/parametres` |
| Profil, photo, préférences de notification | `src/app/(app)/profil` |
| Notifications | `src/app/(app)/notifications`, `src/lib/cron.ts` |
| Base de données, RLS, historique | `supabase/schema.sql` (tests : `supabase/tests/`) |

Le tableau `DAILY_REPORTS` du cahier des charges n'est pas stocké : un rapport journalier correspond au planning du jour une fois son bilan soumis (`daily_plans.status = 'closed'`), et tous les rapports sont recalculés à la demande à partir des données, ce qui garantit des chiffres toujours reproductibles.

## Développement local (pour un développeur)

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs
npm run dev                  # http://localhost:3000
npm run build                # vérification avant mise en production
npm run test:dates           # calculs de périodes (aucun service requis)
```

### Tester les permissions (RLS)

`supabase/tests/` contient une suite qui charge `schema.sql` sur un PostgreSQL local jetable (avec un faux schéma `auth`/`storage`) et vérifie une cinquantaine de règles : isolation entre collaborateurs, périmètre du manager, justification obligatoire, planning figé après soumission, bilan verrouillé après clôture, historique des corrections, accès aux justificatifs.

```bash
PGHOST=localhost PGPORT=5432 PGUSER=postgres npm run test:db
```

Ces tests ne doivent **jamais** être exécutés sur la base Supabase de production.

## Phases suivantes

- **Phase 2** : export Excel (ExcelJS), notifications e-mail/WhatsApp, comparaison avancée des départements, indicateurs qualité (retouches, validations), espace client.
- **Phase 3** : coût horaire par collaborateur (colonne `profiles.hourly_cost` déjà prévue), coûts et marges par projet et par client, analyse de capacité, synthèses assistées par IA (sans jamais inventer de résultats).
