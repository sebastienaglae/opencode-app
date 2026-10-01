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
│  ┌──────────────────────┐  │   HTTPS/HTTP + WS
│  │ UI OpenCode-like     │  │◄──────────────────────────┐
│  │ SSE/WS client        │  │                           │
│  │ Store sessions       │  │                           │
│  └──────────────────────┘  │                           │
└────────────────────────────┘                           │
                                                         ▼
                            ┌───────────────────────────────────────────┐
                            │  Machine OpenCode (Windows/Mac/Linux)     │
                            │                                           │
                            │  Option A — DIRECT                        │
                            │    opencode serve --hostname 0.0.0.0 \    │
                            │      --port 47821                         │
                            │    Basic auth: opencode:<password>        │
                            │                                           │
                            │  Option B — BRIDGE (recommandé)           │
                            │    opencode-remote-bridge (Node/TS)       │
                            │      • se connecte à OpenCode             │
                            │      • expose REST + SSE + WS PTY         │
                            │      • token Bearer + CORS + upload       │
                            │      • bind 1er port libre parmi 10       │
                            └───────────────────────────────────────────┘
```

### Option A — Connexion directe
Le téléphone parle directement à l'API OpenCode (`/api/*`).
- ➕ Aucun process supplémentaire.
- ➖ CORS + mixed-content à gérer côté WebView Android.
- ➖ L'authentification SSE avec header `Authorization` est fragile depuis le WebView.
- ➖ Le mot de passe Basic OpenCode doit être stocké sur le téléphone.

### Option B — Bridge compagnon (recommandé)
Un petit serveur Node/TS (`@opencode/client`) tourne à côté d'OpenCode.
- ➕ **Streaming via WebSocket** → aucun souci CORS / mixed-content.
- ➕ **Token Bearer dédié** (révocable) ; le mot de passe OpenCode reste sur la machine.
- ➕ **Port fallback** : bind sur le 1er port libre d'une liste de 10.
- ➕ Upload de fichiers unifié, QR code de connexion, mDNS.
- ➖ Un process à lancer (script fourni, `start-remote.ps1` / `.sh`).

> Le plan couvre les deux, mais l'app est conçue contre une **couche d'abstraction**
> `OpenCodeTransport` afin de basculer sans réécrire l'UI.

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
```