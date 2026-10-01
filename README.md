# OpenCode Remote

Application **Android** (Ionic + Capacitor) pour piloter **OpenCode Desktop (GUI)** à
distance — même via un VPN Freebox — avec **streaming temps réel** des réflexions, des
outils, du texte, du coût et des tokens.

> OpenCode Desktop est un *frontend* du service d'arrière-plan partagé
> (`opencode service`). L'app se connecte à **ce même service** : les sessions créées
> sur le téléphone apparaissent dans le Desktop, et inversement.

---

## Architecture

```
Téléphone Android (Ionic + Capacitor)
        │  HTTP (REST) + WebSocket (événements/PTY)
        │  sur le réseau LAN / VPN Freebox
        ▼
opencode-remote-bridge (Node)          ← écoute sur 0.0.0.0:<port>
        │  localhost + Basic opencode:<password>
        ▼
Service partagé OpenCode  ◄──  OpenCode Desktop GUI / TUI
```

Le bridge :
- lit `~/.local/state/opencode/service.json` (URL + mot de passe du service partagé) ;
- expose une API REST proxifiée (`/api/*`) + un flux d'événements WebSocket (`/events`) ;
- ajoute un **token Bearer** dédié et gère le CORS ;
- se lie au **premier port libre** parmi une liste de 10 ports obscurs.

Le service OpenCode **reste en localhost** : seul le bridge est exposé au VPN.

---

## Prérequis

- **OpenCode Desktop** (ou TUI/CLI) lancé au moins une fois → il démarre le service partagé.
- **Node.js ≥ 20** (testé sur Node 24) sur la machine OpenCode.
- Pour l'app : Node.js + npm (dev), et **Android Studio** (ou SDK Android + JDK 21) pour l'APK.

---

## 1. Lancer le bridge

Sur la machine qui fait tourner OpenCode Desktop :

```powershell
# Windows
.\start-bridge.ps1
```
```bash
# macOS / Linux
./start-bridge.sh
```

Sortie typique :

```
  OpenCode service : http://127.0.0.1:49374  (v2.0.21)
  Bridge listening : 0.0.0.0:47821
  Auth             : Bearer pNjIVpiMJ5QTvJjvQgpDF6GzRdFPczs15KN8_SkFXBY

  Enter one of these in the app (Settings):
    host: 127.0.0.1        port: 47821
    host: 192.168.1.133   port: 47821   (LAN / VPN)
```

Options :

```bash
node bridge/src/index.ts \
  --host 0.0.0.0 \
  --ports 47821,47311,48240,46901,49923,45177,48812,46355,49730,47688 \
  --token <token-perso> \
  --cors "*" \
  # --server http://127.0.0.1:49374 --password <secret>   (si service.json introuvable)
  # --anonymous                                            (dev LAN uniquement)
```

Le token est généré et persisté dans `~/.opencode-remote/config.json`.

---

## 2. Configurer l'app

Dans **Réglages** :

| Champ | Valeur |
|-------|--------|
| Hôte | IP LAN/VPN de la machine (ex. `192.168.1.133`) |
| Port principal | `47821` (ou celui affiché par le bridge) |
| Ports de secours | les 10 ports (préremplis) |
| Token | le token Bearer affiché par le bridge |

Puis **Enregistrer & connecter**. L'app sonde le port principal puis bascule
automatiquement sur les ports de secours si besoin. Un badge indique l'état
(`connecté:47821 · flux ok`).

> L'écran Réglages affiche aussi la version du service OpenCode, le pid et la latence.

---

## 3. Développement & build Android

```bash
npm install

# Dev web (dans un navigateur, pour itérer vite)
npm run dev                 # http://localhost:5173

# Build web + sync natif
npm run build
npx cap sync android

# Ouvrir dans Android Studio
npx cap open android

# APK debug (nécessite JDK + SDK Android configurés)
npm run android:debug       # -> android/app/build/outputs/apk/debug/app-debug.apk
```

Si `JAVA_HOME` / `ANDROID_HOME` ne sont pas définis, Android Studio suffit :
ouvre le dossier `android/`, puis **Run**.

---

## Fonctionnalités

### Disponibles (P0→P2)
- Connexion au bridge : découverte du port + token, reconnexion auto, état en direct.
- **Sessions** : liste (recherche, tirer pour rafraîchir), création (titre + dossier),
  renommage, suppression, fork, badges « en cours », coût/tokens.
- **Conversation** : chargement de l'historique paginé, rendu Markdown + coloration
  syntaxique (Shiki), **blocs Réflexion repliables**, **cartes d'outils** (entrée/sortie/
  erreur/durée/statut), texte streaming.
- **Streaming temps réel** via WebSocket : texte, raisonnement, appels/états d'outils,
  statut (`idle|busy|retry`), coût & tokens live, resynchronisation à la reconnexion.
- **Envoyer / Arrêter** un prompt ; upload d'images et de fichiers (appareil photo,
  galerie, fichiers → `data:` URL, ≤ 20 Mo).
- **Système de questions complet** : **Forms** (string/number/integer/boolean/multiselect/
  external) + **Permissions** (`once`/`always`/`reject`), avec **notifications locales**.
- **Commandes** : autocomplétion `/…` dans le composer + liste complète (commandes & skills).
- **Modèles** : sélection du modèle, du **provider** et de l'**effort** (variant), choix de
  l'agent.
- **Contexte & coût** : provider/modèle, effort, agent, nombre de messages (vous/assistant),
  tokens (in/out/reasoning/cache r/w), coût total, dates de création/activité.
- **Modifications** : diff par tour (`/session/{id}/diff`) avec coloration add/del.
- **Fichiers** : navigateur de dossier (`fs/list`) + visionneuse (`fs/read`).
- Thème **dark** (défaut) et **light**, style épuré OpenCode.

### Roadmap (P3→P8, voir `PLAN.md`)
- Gestion avancée des providers/credentials, patch de config.
- Shell de session + terminaux PTY interactifs.
- Découverte mDNS, verrou biométrique, QR de pairing.
- Optimisations de bundle (code-splitting de l'app).

---

## Sécurité

- Le trafic reste **dans le VPN Freebox** : rien n'est exposé sur Internet.
- Le service OpenCode n'écoute **que sur localhost** ; seul le bridge est joignable.
- Le bridge exige un **Bearer token** (sauf `--anonymous`) et journalise les erreurs.
- `/health` est public (nécessaire à la découverte de port) et n'expose que la version/pid.
- Le mot de passe Basic OpenCode ne quitte jamais la machine.

---

## Dépannage

| Symptôme | Piste |
|----------|-------|
| `No OpenCode service found` | Lance OpenCode Desktop une fois, ou passe `--server`/`--password`. |
| L'app reste « hors ligne » | Vérifie l'IP, le port, le token ; teste `curl http://<ip>:47821/health`. |
| `401` sur les appels `/api/*` | Token incorrect (Réglages). |
| Erreurs CORS dans la console (dev) | Uniquement lors du sondage de ports morts ; sans impact. |
| Pas d'APK | Installe JDK 21 + SDK Android, ou build via Android Studio. |

Logs du bridge : sortie standard. Logs OpenCode : `~/.local/share/opencode/log/opencode.log`.

---

## Structure

```
opencode-app/
├─ bridge/                 # compagnon Node/TS (REST proxy + WebSocket)
│  └─ src/{index,config,opencode,server}.ts
├─ src/                    # app Ionic React
│  ├─ core/{api,store,events,format,notify,types}.ts
│  ├─ components/          # MessageView, ToolCard, Composer, QuestionBanner, CodeBlock, DiffView
│  ├─ screens/             # Sessions, Conversation, Files, Models, Commands, Settings
│  └─ theme/theme.css
├─ android/                # projet natif Capacitor
├─ start-bridge.ps1 / .sh
├─ PLAN.md                 # plan détaillé + mapping API
└─ capacitor.config.ts
```

API OpenCode utilisée : voir `PLAN.md` §5 (endpoints) et §6 (catalogue d'événements).
