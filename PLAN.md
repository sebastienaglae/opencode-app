# OpenCode Remote — Plan détaillé

Application mobile **Android** (Ionic + Capacitor) pour piloter **OpenCode Desktop (GUI)**
à distance, y compris via un VPN Freebox, avec streaming temps réel.

---

## 0. Cible réelle : OpenCode Desktop GUI

OpenCode Desktop **n'est pas un serveur** : c'est un **frontend client** qui se connecte au
**même service d'arrière-plan partagé** que la TUI et le web (`opencode service`). Ce service
possède les sessions, la config, les providers, les permissions et l'exécution des outils.

> Conséquence : **piloter ce service partagé = piloter exactement ce que voit l'app Desktop.**
> Les sessions créées depuis le téléphone apparaissent dans le Desktop, et inversement.

Le service partagé :
- écoute par défaut **uniquement sur localhost** (port de canal, ex. `49374`) ;
- publie ses infos (`url`, `pid`, `password`) dans `~/.local/state/opencode/service.json` ;
- s'authentifie en **HTTP Basic** : `opencode:<service-password>` ;
- se configure via `opencode service set {hostname,port,password,cors}` + `opencode service start`.

Notre app se connecte donc **à ce service partagé**, sans créer de serveur concurrent
(sinon on aurait deux jeux de sessions séparés).

---

## 1. Objectifs

| # | Objectif | Statut cible |
|---|----------|--------------|
| 1 | Se connecter à distance à un serveur OpenCode (VPN / LAN / IP) | MVP |
| 2 | Découverte auto : IP/host + liste de ~10 ports obscurs avec fallback | MVP |
| 3 | Lister / créer / renommer / supprimer / forker les sessions | MVP |
| 4 | Streaming temps réel : texte, **réflexions (reasoning)**, **appels d'outils**, états | MVP |
| 5 | Envoyer un prompt, **arrêter** (interrupt), continuer | MVP |
| 6 | Upload d'images et de fichiers depuis le téléphone | MVP |
| 7 | Autocomplétion des commandes `/…` + liste des commandes | MVP |
| 8 | Question système complet : **Forms** (questions structurées) + **Permissions** | MVP |
| 9 | Choisir modèle / provider / **effort (variant)** / agent | MVP |
| 10 | Gérer les modèles & providers (activation, credentials) | V1 |
| 11 | Contexte, coût, tokens (in/out/reasoning/cache r/w), limites, dates | MVP |
| 12 | Voir les **diffs** des modifications + **ouvrir les fichiers** | MVP |
| 13 | Commandes shell distantes (session shell + shells) | V1 |
| 14 | Thème OpenCode : dark + light, épuré | MVP |

---

## 2. Architecture

```
┌────────────────────────────┐        VPN Freebox / LAN
│  Téléphone Android         │        (WireGuard / OpenVPN)
│  Ionic + Capacitor         │
│  ┌──────────────────────┐  │   HTTP/WS
│  │ UI OpenCode-like     │  │◄──────────────────────────┐
│  │ SSE/WS client        │  │  (Basic ou Bearer)        │
│  │ Store sessions       │  │                           │
│  └──────────────────────┘  │                           │
└────────────────────────────┘                           │
                                                         ▼
                       ┌──────────────────────────────────────────────────┐
                       │  Machine OpenCode (Windows/Mac/Linux)             │
                       │                                                  │
                       │   OpenCode Desktop (GUI) ──┐                      │
                       │   TUI / web ───────────────┤ (clients)            │
                       │                            ▼                     │
                       │   ┌──────────────────────────────────────────┐   │
                       │   │ SERVICE PARTAGÉ (opencode service)        │   │
                       │   │  sessions · config · providers · tools    │   │
                       │   │  défaut: 127.0.0.1:<port>  Basic auth     │   │
                       │   └──────────────────────────────────────────┘   │
                       │            ▲                                     │
                       │            │ localhost                           │
                       │   Option A │ (exposer le service)                │
                       │   ─────────┤                                     │
                       │            │   Option B — BRIDGE (recommandé)     │
                       │   ┌────────┴──────────────────────────────────┐  │
                       │   │ opencode-remote-bridge (Node/TS)          │  │
                       │   │  • lit service.json → parle au service    │  │
                       │   │  • expose REST + SSE + WS (events + PTY)  │  │
                       │   │  • token Bearer + CORS + upload fichiers  │  │
                       │   │  • bind 0.0.0.0 sur 1er port libre / 10   │  │
                       │   └───────────────────────────────────────────┘  │
                       └──────────────────────────────────────────────────┘
```

### Option A — Exposer le service partagé
```
opencode service set hostname 0.0.0.0
opencode service set port 47821
opencode service set password "<secret-long>"
opencode service set cors https://localhost    # origine WebView Capacitor
opencode service start
```
Le téléphone parle directement à l'API `/api/*` du service partagé (Basic `opencode:<password>`).
- ➕ Aucun process supplémentaire ; sessions Desktop/TUI/téléphone strictement identiques.
- ➖ Le service devient joignable sur le LAN (le VPN encadre l'accès).
- ➖ CORS + mixed-content à gérer côté WebView Android ; SSE avec header `Authorization` fragile.
- ➖ Mot de passe stocké sur le téléphone.

### Option B — Bridge compagnon (recommandé)
Un petit serveur Node/TS (`@opencode/client`) tourne à côté, **sur la même machine**.
- Lit `service.json` et se connecte au service partagé en **localhost**.
- Expose une surface unique (REST + **WebSocket** pour les événements et le PTY).
- ➕ **Streaming WS** → aucun souci CORS / mixed-content Android.
- ➕ **Token Bearer dédié** (révocable) ; le mot de passe OpenCode ne quitte pas la machine.
- ➕ Le service partagé **reste en localhost** (rien d'autre n'est exposé que le bridge).
- ➕ **Port fallback** : bind sur le 1er port libre d'une liste de 10.
- ➕ Upload de fichiers unifié, QR code de connexion, mDNS.
- ➖ Un process à lancer (script fourni, `start-remote.ps1` / `.sh`).

> Le plan couvre les deux ; l'app est conçue contre une **couche d'abstraction**
> `OpenCodeTransport` pour basculer sans réécrire l'UI.

---

## 3. Découverte & connexion

### Endpoint logique
`{scheme}://{host}:{port}` + `Authorization`.

### Host
1. Dernière adresse connue (stockée).
2. Saisie manuelle de l'IP LAN (ex. `192.168.1.42`) ou du hostname VPN.
3. Découverte mDNS/Bonjour (`_opencode-remote._tcp`) via un plugin natif — V1.
4. Scan optionnel du sous-réseau (limité, opt-in) — V1.

### Ports (obscurs, ordre de tentative)
Liste par défaut (surchargeable dans les réglages) :

```
47821, 47311, 48240, 46901, 49923, 45177, 48812, 46355, 49730, 47688
```
Puis ports secondaires OpenCode : `49374`, `4096`.

Logique : **probe parallèle** (timeout 1200 ms, `GET /api/info` ou `/health` côté bridge),
mémorisation du premier port valide, reconnexion auto (backoff exponentiel + re-probe).

---

## 4. Sécurité & authentification

| Méthode | Usage |
|---------|-------|
| `Basic opencode:<service-password>` | Connexion directe (Option A) |
| `Authorization: Bearer <token>` | Bridge (Option B) |
| `opencode pair` → lien/QR + cookie session (30 j) | Alternative directe sans mot de passe |
| Stockage local | `@capacitor/preferences` (chiffré recommandé : `@aparajita/capacitor-secure-storage`) |

- Le trafic reste **dans le VPN Freebox** → pas d'exposition Internet.
- Le bridge : token long, CORS restreint, rate-limit simple, journalisation.
- Verrou biométrique optionnel (`@capacitor/privacy-screen` + `BiometricPrompt`) — V1.

---

## 5. Contrat OpenCode V2 exploité

### Sessions
| Action | Endpoint |
|--------|----------|
| Lister (pagination, search, parentID, directory) | `GET /api/session` |
| Créer (titre, agent, model, `location.directory`) | `POST /api/session` |
| Récupérer / Renommer / Supprimer | `GET/PATCH/DELETE /api/session/{id}` |
| Actives | `GET /api/session/active` |
| Fork / Move / Model / Agent | `POST /api/session/{id}/{fork,move,model,agent}` |
| Contexte (messages provider) | `GET /api/session/{id}/context` |
| Diff des tours | `GET /api/session/{id}/diff?from&to&context` |
| Stats globales | `GET /api/experimental/session/stats` |
| Inbox (file d'attente) | `GET /api/session/{id}/inbox` |

### Conversation
| Action | Endpoint |
|--------|----------|
| Messages (pagination) | `GET /api/session/{id}/message?limit&order&cursor&type` |
| Message unique | `GET /api/session/{id}/message/{messageID}` |
| **Envoyer prompt** (texte + files + skills + delivery/resume) | `POST /api/session/{id}/prompt` |
| **Commande** `/…` | `POST /api/session/{id}/command` |
| **Shell de session** | `POST /api/session/{id}/shell` |
| **Interrupt** | `POST /api/session/{id}/interrupt?resume` |
| Compact / Synthetic / Skill | `POST /api/session/{id}/{compact,synthetic}` · `/skill` |
| Revert (stage/commit/clear) | `POST/DELETE /api/session/{id}/revert*` |

### Questions & permissions
| Action | Endpoint |
|--------|----------|
| Lister les forms en attente | `GET /api/form` · `GET /api/session/{id}/form` |
| **Répondre à une question** | `POST /api/session/{id}/form/{formID}/reply` (`{answer:{key:value}}`) |
| Lister permissions | `GET /api/permission/request` · `GET /api/session/{id}/permission` |
| **Répondre permission** | `POST /api/session/{id}/permission/{reqID}/reply` (`once\|always\|reject`) |

### Modèles / providers / agents
| Action | Endpoint |
|--------|----------|
| Modèles (variants, limite contexte, coûts, cap.) | `GET /api/model` |
| Modèle par défaut | `GET /api/model/default` |
| Providers | `GET /api/provider`, `GET /api/provider/{id}` |
| Intégrations / credentials | `GET /api/integration*`, `POST …/connect/{key,oauth,command}` |
| Agents | `GET /api/agent`, `GET /api/agent/{id}` |
| Config globale (patch) | `GET /api/config`, `PATCH /api/experimental/config` |

### Commandes / skills / fichiers / VCS / shell / PTY
| Action | Endpoint |
|--------|----------|
| Commandes dispo (autocomplétion) | `GET /api/command` |
| Skills | `GET /api/skill` |
| Lire un fichier | `GET /api/fs/read/*` |
| Lister / trouver | `GET /api/fs/list`, `GET /api/fs/find` |
| Écrire un fichier | `POST /api/experimental/fs/write?path=` |
| VCS info/status/diff/branches | `GET /api/vcs{,/status,/diff,/branch}` |
| Shells (globaux) | `GET/POST /api/shell`, `GET /api/shell/{id}/output` |
| PTY (terminal interactif) | `GET/POST /api/pty`, `POST /api/pty/{id}/connect-token`, WS `/api/pty/{id}/connect` |
| Worktrees / projects | `GET/POST /api/worktree`, `GET /api/project` |
| Web search | `POST /api/websearch` |

---

## 6. Streaming temps réel (cœur de l'app)

Source : `GET /api/event` (SSE, `text/event-stream`) — ou WS `…/events` via le bridge.
**Live only, sans replay** → au (re)connect on refait `GET message` puis on applique les deltas.

### Événements consommés
```
session.created / session.renamed / session.deleted / session.moved
session.agent.selected / session.model.selected / session.metadata.updated
session.execution.started / .succeeded / .failed / .interrupted
session.step.started / .streamed / .ended / .failed
session.text.started / session.text.delta / session.text.ended
session.reasoning.started / session.reasoning.delta / session.reasoning.ended
session.tool.input.started / .delta / .ended
session.tool.called / session.tool.progress / session.tool.success / session.tool.failed
session.usage.updated / session.usage.recorded
session.status  (idle | retry | busy)
session.idle
session.shell.started / .ended
session.compaction.started / .delta / .ended / .failed
session.retry.scheduled
session.message.content.updated
form.created / form.replied / form.cancelled
permission.asked / permission.replied
pty.created / pty.updated / pty.exited / pty.deleted
filesystem.changed / vcs.branch.updated / mcp.status.changed
server.connected
```

### Réduction en state UI
Chaque `data.assistantMessageID` + `ordinal` identifie un « part ».
- `text.delta` → append au part texte (streaming Markdown).
- `reasoning.delta` → append au bloc « Réflexion » repliable.
- `tool.input.*` → part outil état `streaming` avec input JSON brut.
- `tool.called/progress/success/failed` → MAJ état outil + résultat (contenu, metadata, erreur).
- `step.*` → coût/tokens du step ; `usage.updated` → agrégat session.
- `status`/`idle`/`execution.*` → état « en cours / en attente / terminé » + bouton Stop.
- `permission.asked` / `form.created` → bannière modale + notification locale.

Reconnexion : `server.connected` puis re-fetch page de messages pour resynchroniser.

---

## 7. Écrans & navigation

```
[Tabs / Drawer]
├─ Sessions            liste, recherche, filtre projet/dossier, badges actifs
│   └─ Nouvelle session  (dossier/projet, agent, modèle, effort/variant, permissions)
├─ Conversation        chat + streaming + composer
│   ├─ Panneau Contexte (contexte, coût, tokens, modèle, limites)
│   ├─ Panneau Diff     (fichiers modifiés → ouvre visionneuse)
│   ├─ Panneau Inbox    (file d'attente, annuler)
│   └─ Terminal/Shell   (shell de session, PTY — V1)
├─ Fichiers            navigateur (fs/list, find) + visionneuse (fs/read)
├─ Modèles             providers, modèles, variants(effort), credentials, config
├─ Commandes           liste /api/command + skills
└─ Réglages            host, ports, auth, thème, à propos
```

### Conversation (écran central)
- Header : titre, provider/modèle + **sélecteur d'effort**, agent, badge état, cost/tokens.
- Fil : messages user/assistant ; blocs **Reasoning** (repliable), **Tool** (nom, input, statut,
  durée, résultat, erreur), **Texte** (Markdown + coloration syntaxique), **Diff** inline.
- Composer : texte (autocomplétion `/` + `@` fichiers/skills), pièces jointes (camera/galerie/
  fichiers → `data:` URL), bouton Envoyer, bouton **Stop** (interrupt) pendant l'exécution.
- Bannières : question (Form) et permission, avec réponses rapides.

---

## 8. Mapping « demande utilisateur → implémentation »

| Demande | Où |
|---------|-----|
| Streaming réflexions + tools | §6 |
| Upload images/fichiers | composer → `data:` URL (≤ 20 MiB) ; `POST /prompt` `files[]` |
| Commandes shell à distance | `POST /session/{id}/shell` (V1) + `/api/shell` |
| Choisir n'importe quel modèle | `GET /api/model` + `POST /session/{id}/model` |
| Gérer les modèles | écran Modèles / Providers / config (V1) |
| Choisir l'effort | `Model.Ref.variant` (variants du modèle) |
| Créer une session dans un dossier | `POST /api/session {location.directory}` |
| Envoyer / Arrêter | `POST /prompt`, `POST /interrupt` |
| Système de questions | Forms + Permissions (§5, §7) |
| Renommer / supprimer session | `PATCH` / `DELETE /api/session/{id}` |
| Contexte, coût, usage, tokens | `Session.Info.{cost,tokens}`, `SessionStats`, `usage.*`, `Model.limit.context` |
| Autocomplétion + liste commandes | `GET /api/command` + composer |
| Infos session complètes | id, titre, #messages, provider/modèle, limite contexte, tokens totaux, in/out/reasoning/cache r/w, msgs user/assistant, coût, créée, dernière activité |
| Voir les modifications | `GET /session/{id}/diff`, `GET /api/vcs/diff` |
| Ouvrir les fichiers | `GET /api/fs/read/*` + visionneuse (lien fichier → lecture) |
| Thème OpenCode dark/light | design tokens (§10) |

---

## 9. Modèle de données local

```ts
Settings   { host, ports[], token|basicAuth, tls, theme, lastModel, lastAgent, limits }
Server     { url, port, version, pid, status, latency }
SessionView{ info: SessionInfo, messages: Message[], parts: Map<id,Part[]>,
             status: 'idle'|'busy'|'retry', usage, diff, inbox, forms, permissions }
Part       { kind:'text'|'reasoning'|'tool', ordinal, text?, tool?{name,input,state,content,error,time} }
```

Cache : `@capacitor/preferences` (clé/valeur JSON) + IndexedDB pour les gros fils.

---

## 10. Style OpenCode

- Design tokens CSS : `--oc-bg`, `--oc-surface`, `--oc-border`, `--oc-text`, `--oc-muted`,
  `--oc-accent`, `--oc-success`, `--oc-warn`, `--oc-danger`, palettes **dark** & **light**.
- Typo mono pour code (`JetBrains Mono`/`ui-monospace`), sans pour l'UI.
- Composants Ionic avec `--ion-*` mappés sur les tokens ; coins discrets, bordures 1px,
  densité élevée, aucun gradient superflu → « épuré ».
- Coloration syntaxique : **Shiki** ; Markdown : `react-markdown` + `remark-gfm` ;
  Diffs : rendu maison (patch `FileDiff.Info`) ou `diff2html`.

---

## 11. Stack & dépendances

- **Ionic React + Vite + TypeScript**, **Capacitor 7** (Android uniquement).
- État : **Zustand** (+ `@tanstack/react-query` pour le REST).
- Transport : `fetch` / client `@opencode/client` + **WS** (bridge) ou **SSE** (direct).
- Android : `@capacitor/{camera,filesystem,preferences,share,local-notifications,app,privacy-screen}`.
- Build : `npm run build` → `npx cap sync android` → `./gradlew assembleDebug|Release`.

## 12. Arborescence

```
opencode-app/
├─ android/                         # projet natif Capacitor
├─ bridge/                          # Option B (Node/TS)
│   ├─ src/{index,config,opencode,proxy,events,pty,ports,auth}.ts
│   └─ package.json
├─ src/
│   ├─ app/                         # routes Ionic (tabs)
│   ├─ components/                  # MessageList, Part*, ToolCard, Reasoning, Diff, Composer…
│   ├─ screens/                     # Sessions, Conversation, Files, Models, Commands, Settings
│   ├─ core/
│   │   ├─ api/                     # clients REST par ressource
│   │   ├─ transport/               # OpenCodeTransport (SSE | WS bridge)
│   │   ├─ events/                  # parser + reducer d'événements
│   │   ├─ discovery/               # host + probe des 10 ports
│   │   └─ store/                   # Zustand slices
│   ├─ theme/                       # tokens dark/light, ion override
│   └─ main.tsx
├─ capacitor.config.ts
├─ package.json
└─ PLAN.md
```

## 13. Phases

1. **P0 — Socle** : scaffold Ionic React + Capacitor Android, thème, navigation, Settings, découverte/connexion.
2. **P1 — Sessions & chat** : liste/création/suppression/renommage, messages, envoi prompt, interrupt.
3. **P2 — Streaming** : SSE/WS, reasoning, tools, état, coût/tokens live, reconnexion.
4. **P3 — Questions** : Forms + Permissions + notifications.
5. **P4 — Modèles** : sélection modèle/variant(effort)/agent, gestion providers/credentials, config.
6. **P5 — Fichiers & diffs** : navigateur, visionneuse, upload, diff viewers.
7. **P6 — Commandes & shell** : autocomplétion, `/command`, shell de session, PTY.
8. **P7 — Bridge** (Option B) + découverte mDNS + durcissement.
9. **P8 — Polish** : thème light, a11y, perfs (virtualisation), APK release.

## 14. Risques & limites connues

- `GET /api/event` **sans replay** → resync obligatoire à la reconnexion.
- Streaming direct (Option A) sensible au CORS/mixed-content Android → privilégier le bridge.
- Pièces jointes ≤ 20 MiB décodées ; images nécessitent un modèle multimodal.
- Transport WS mobile en arrière-plan : utiliser un foreground service pour ne pas couper.
- Endpoints marqués « experimental » peuvent évoluer entre versions d'OpenCode.
- Certaines routes `persistentPty/terminal` sont expérimentales → V1/V2.

---

## 15. Refonte UI/UX (retour utilisateur, v0.2)

Décisions prises suite au premier test sur téléphone :

### 15.1 Stack
- **Tailwind CSS v4** (`@tailwindcss/vite`) utilisé au maximum pour la mise en page et le style ;
  les design tokens restent des variables CSS (`--oc-*`) mappées en couleurs Tailwind via `@theme inline`.
- **Motion** (`motion/react`) pour les animations : ouverture/fermeture des blocs, sheets, bouton
  « aller en bas », transitions.
- **i18n** : dictionnaire `fr`/`en` (`src/core/i18n.ts`), **français par défaut**, sélecteur dans Réglages.
  Toute l'interface est traduite.
- Ionic conservé (`IonApp`, `IonIcon`, `IonSpinner`) + Capacitor ; le scroll est un conteneur natif
  (`overflow-y-auto`, scrollbar masquée) pour un comportement mobile fiable.

### 15.2 Navigation & sessions
- Header d'app : **mark OpenCode + « OpenCode » + nombre de sessions** + pastille d'état discrète
  (le port et le libellé « connecté » sont retirés du header).
- **Groupement par projet** : d'abord les **projets**, puis les sessions du projet.
  Projets et sessions **actifs en premier**, puis par activité décroissante.
- Sous le nom d'une session : **pas de modèle, pas de coût** (déplacés dans le détail contexte).

### 15.3 Conversation
- **Message utilisateur** : bulle distincte avec marge supérieure, libellé « Vous », **copie**,
  et **chip modèle** cliquable sous la bulle.
- **Pas de répétition « Assistant / provider / modèle »** sur chaque message.
- **Réflexion** : ligne **sans cadre** (chevron + « Réflexion » + animation shimmer pendant
  l'exécution) ; dépliable **pendant et après** l'exécution.
- **Outils** : **empilés** en une ligne « N appels d'outils » (chevron) → liste des outils ;
  chaque outil se déplie (entrée/sortie/erreur/durée). Même style que la réflexion.
- **Shell** : même style que la réflexion, libellé « Exécution », déplie commande + sortie.
- **Fin de session** : bloc **stats** (messages, outils, tokens in/out/reasoning/cache, coût,
  durée, vitesse tok/s).
- **Modèle** : dropdown compact (sheet) avec **recherche**, groupé par provider,
  **OpenCode Go en premier** puis OpenCode ; choix modèle × **effort (variant)**.
- **Progress circulaire de contexte** sous les trois points : % du contexte utilisé
  (basé sur le **dernier step**, pas le cumul) ; clic → détail complet
  (id, dossier, provider, modèle, effort, agent, messages, tokens, coût, dates).
- Menu : renommer, compacter, modifications (diff), fork, supprimer.
- **Scroll robuste** : collé en bas sans saut visuel, bouton « aller en bas » si on remonte,
  **pagination vers le haut** qui charge les messages plus anciens en préservant la position.

### 15.4 Chargement & performance
- On charge d'abord les **derniers messages** (`order=desc`, 50) puis on remonte par curseur.
- **Annulation** des requêtes en vol (`AbortController`) au changement de session / démontage.
- Fusion des derniers messages à l'idle pour réconcilier sans perdre l'historique chargé.

### 15.5 Identité
- **Icône d'application** générée depuis le mark OpenCode (anneau carré « O ») :
  adaptive icon + legacy + round + favicon web (`scripts/gen-icons.mjs`, via `sharp`).

### 15.6 Git
- Dépôt initialisé et poussé sur `https://github.com/sebastienaglae/opencode-app` (branche `main`).

---

## 16. Deuxième passe (v0.3)

### 16.1 Correctif critique : cascade CSS
- Le CSS Ionic (`normalize.css`) contient un `button { padding:0; border-radius:0 }` **non-layeré**,
  qui écrasait toutes les utilitaires Tailwind (les règles non-layerées gagnent sur les `@layer`).
- Correctif : `src/theme/ionic.css` importe tout le CSS Ionic avec `layer(ionic)`, importé **avant**
  `theme.css`. Ordre des layers : `ionic` < `theme` < `base` < `utilities` → Tailwind gagne.
- C'était la cause de la plupart des problèmes visuels (« collé », une seule ligne, etc.).

### 16.2 Couleur
- Accent passé en **bleu** (`#5b9dff` dark / `#2563eb` light) pour coller à OpenCode.

### 16.3 Conversation
- **Prompts longs** : repliés sur ~6 lignes (`line-clamp-6`) avec « Afficher plus / Réduire » + copie.
- **Réflexion + outils regroupés** en une seule ligne « N Modifier et Shell utilisés » (comme le
  Desktop), dépliable ; chaque ligne outil affiche un **résumé** (commande, chemin, URL) et sa durée.
- Réflexion : **Markdown** + durée ; outils : entrée/sortie/erreur, largeur pleine, espacement corrigé.
- **Composer** : plus de scrollbar parasite, hauteur auto ; sélecteurs **Modèle** et **Agent** sous
  l'input (à côté de + et caméra) ; autocomplétion en **overlay** (ne pousse plus la mise en page).
- **Stats de fin** : une seule ligne discrète (messages, outils, tokens, coût, durée, tok/s).
- Bouton « aller en bas » arrondi + animé ; scroll fluide.

### 16.4 Commandes & MCP
- **Toutes** les commandes intégrées listées (init, review, new, undo, compact, fork, export, open,
  terminal, pty, mcp, model, connect, agents, skills, share, help) + commandes serveur.
- Câblage : compact, new, fork, undo, model, agents, mcp, skills, init/review (serveur).
- Nouvel onglet **MCP** (`GET /api/mcp`) et **Skills** ; vue plus lisible.

### 16.5 Projets / Sessions / Fichiers
- **Page Projets** dédiée (nom, chemin disque copiable, nombre de sessions, actif d'abord) →
  **page Sessions du projet** (recherche, création dans le dossier du projet).
- **Fichiers** : choix du **projet** à explorer, **aperçu des images** (`fsReadBlob` + objectURL),
  lecture texte/coloration. Accès **cantonné au dossier du projet** sélectionné.

### 16.6 Modèles & agents
- Page Modèles enrichie : provider (OpenCode Go en premier), ctx/out, statut, tools/vision, famille,
  coût $/M in/out, date de sortie, **toutes les variantes d'effort**.
- Sélecteur de modèle mobile plus grand et recherchable ; sélecteur d'agent ; **agents en cours**
  affichés dans l'en-tête de conversation.

---

## 17. Troisième passe (v0.5) — exécution distante & finitions

- **Exécution de commandes à distance** :
  - `POST /api/shell { command, cwd }` → `Shell.Info`, puis `GET /api/shell/{id}/output` (polling)
    pour la sortie, `GET /api/shell/{id}` pour le statut/exit, `DELETE /api/shell/{id}` pour tuer.
  - Écran **Terminal** (`/console`) : historique commande → sortie, statut, exit code, durée, kill.
  - Composer : préfixe **`!commande`** → exécution one-shot + résultat en feuille.
- **Commandes câblées** : `/terminal`, `/pty`, `/shell` → console ; `/export` (share Android / copie) ;
  `/open` → Fichiers ; `/connect` → Modèles ; `/help` → aide.
- **Liens de fichiers dans les messages** : les chemins et `file://` deviennent cliquables
  (Markdown `a` + code inline) et s'ouvrent dans la visionneuse, **cantonné au projet**.
- **Nettoyage projets** : les « projets » sans session et sans VCS (disques, dossiers temp) sont masqués.
- Correctif StrictMode : le flag d'annulation du polling était invalidé par le double-montage React.
- Docs : README (section exécution distante), AGENTS.md, mockups sanitizés.

---

## 18. Quatrième passe (v0.6) — production ready

- **Non autorisé / hors ligne** : bannière proéminente globale (`ConnectionBanner`) avec
  message clair + « Réessayer » / « Configurer » ; flag `authorized` dans le store de connexion.
- **Headers à hauteur constante** : composant `AppHeader` (« OpenCode » en haut + sous-titre
  = section/contexte) appliqué à tous les écrans.
- **Retour Android** : gestion du geste/bouton retour (`backButton`) → `history.back()`.
- **Japonais** : dictionnaire `ja` complet + `values-ja` pour le widget.
- **Onboarding** : landing au premier lancement demandant les permissions (notifications).
- **Permissions** : section Réglages (notifications/caméra) avec état + bouton d'autorisation.
- **Modèle par défaut** : préférence basée sur le dernier modèle utilisé / sessions récentes ;
  jamais vide (auto-appliqué si la session n'a pas de modèle).
- **Icône de notification** : `ic_stat_opencode` (monochrome) + `smallIcon` défini.
- **Liens de fichiers** : résolus par rapport au **dossier du projet** courant ; la visionneuse
  reçoit le bon répertoire.
- **Sécurité / TLS** : bridge `--tls --cert --key` → HTTPS/WSS ; option « Connexion chiffrée »
  dans les Réglages ; doc sécurité (VPN + TLS). **Aucun secret dans le dépôt** (token, IP perso
  retirée du code ; artefacts iOS/Android ignorés).
- **iOS préparé** : plateforme Capacitor iOS + widget WidgetKit + plugin iOS (App Group) +
  `docs/ios.md`.

---

## 20. Sixième passe (v0.8) — QR, widget responsive, tray Windows

- **Widget responsive** : `onAppWidgetOptionsChanged` + largeur → 0/3/6 lignes ; la liste des
  sessions en cours est passée au widget (`sessions` JSON) et affichée quand il y a la place ;
  chrono live pour une seule session. **Écran verrouillé** : `widgetCategory="home_screen|keyguard"`.
  iOS : rendu par `widgetFamily` (small/medium/large).
- **QR** : le bridge affiche un **QR ASCII**, écrit `qr.png` et `state.json`
  (`~/.opencode-remote/`) ; l'app scanne un QR via la caméra + **jsQR** (`Settings → Scanner un QR`).
- **Tray Windows** : `tray/opencode-remote-tray.ps1` (NotifyIcon) — panneau QR + réglages,
  copier le lien, démarrer/arrêter le bridge.

---

## 19. Cinquième passe (v0.7) — prévisualisation & chiffrement local

- **Prévisualisation in-app** : `GET /servers` (le bridge sonde les ports de dev courants sur
  la machine) ; écran **Preview** avec iframe, barre de port, chips des serveurs détectés, et
  **permission explicite** au premier usage (`previewAllowed`). Accessible depuis le menu de
  conversation.
- **TLS auto-signé** : `--tls` génère (ou réutilise) un certificat auto-signé
  (`~/.opencode-remote/tls`), sert **HTTPS/WSS** et affiche l'empreinte. `--cert/--key` pour un
  vrai certificat. Option « Connexion chiffrée » dans les Réglages.
- **Android** : `network_security_config.xml` (cleartext + CAs système/utilisateur) et
  `MainActivity` qui accepte le certificat auto-signé **uniquement pour les hôtes privés/LAN**.
  Le VPN couvre l'extérieur ; le TLS couvre le Wi‑Fi local.

