# Gamut — Unified Game Library Launcher: Plan

Gamut is a desktop app that pulls every game you own, from every store, into one good-looking library, and launches, installs, and tracks them from one place.

---

## 1. Goals

1. **One library.** Every owned game from every store in one list, with duplicates merged (for example, the same game owned on Steam and GOG shows once, with both sources).
2. **Looks good.** Cover art, hero banners, logos, screenshots, descriptions, genres, ratings, playtime.
3. **One click to play.** Launch any game, installed through any launcher, from Gamut.
4. **Install and uninstall** by handing off to the store's own client. Gamut does not download game files itself in v1.
5. **Works offline.** The library is cached locally, so it opens instantly without internet.
6. **Expandable.** Each store is a separate plugin ("connector"), so new stores can be added without touching the core.

### Not in v1
- Downloading or patching games directly (Gamut leaves that to each store's client; Epic and GOG could be added later through Legendary/Heroic-style code).
- Buying games, store pages, friends, or chat.
- Mobile app (a phone "remote library viewer" could come later).

---

## 2. Existing projects to learn from (or build on)

| Project | What it is | What to take from it |
|---|---|---|
| **Playnite** (C#, open source, Windows) | The closest existing app to this idea. Library plugins for 20+ stores. | Its store plugin code shows how each store's library is read. **Option:** build Gamut as a Playnite theme + plugins instead of a new app. |
| **GOG Galaxy 2.0** | Closed app with open-source Python integrations | `galaxy-integrations-python-api` and community plugins document each store's private API. |
| **Heroic Games Launcher** (Electron, open source) | Epic / GOG / Amazon on Windows, macOS, Linux | Uses **Legendary** (Epic), **gogdl** (GOG), **Nile** (Amazon). |
| **Lutris** (Linux) | Runners for Wine, emulators, stores | Linux + emulator support. |
| **LaunchBox** | Emulation-focused front end | "Big Picture" style UI ideas. |

**Decision to make first:** build a new app (full control over looks and features, more work) or extend Playnite (most store integrations already exist, but Windows-only and limited to its UI). This plan assumes a **new app**, using Playnite and Heroic code as a reference for how each store works.

---

## 3. Store integration matrix

Every connector does up to four jobs:

- **A. Owned games**: the full list, including games not installed (usually needs login).
- **B. Installed games**: found by reading local files and the registry (no login needed).
- **C. Launch**: usually through the store's URL scheme.
- **D. Install / uninstall**: usually through a URL scheme that opens the store client.

Paths are Windows defaults unless noted. "Unofficial" means a private API used by the store's own client: it can change without warning, so wrap it carefully.

### Tier 1 (build first)

| Store | A. Owned games | B. Installed games | C. Launch | D. Install |
|---|---|---|---|---|
| **Steam** | **Official** Steam Web API: `IPlayerService/GetOwnedGames` (Web API key + SteamID64; profile game details must be public, or sign in with Steam OpenID) | `steamapps/libraryfolders.vdf` → each folder's `appmanifest_<appid>.acf` | `steam://rungameid/<appid>` | `steam://install/<appid>`, `steam://uninstall/<appid>` |
| **Epic Games** | Unofficial: Epic OAuth through a login webview, then the library service (as Legendary does) | `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item` (JSON) | `com.epicgames.launcher://apps/<AppName>?action=launch&silent=true` | Open the launcher at the game page |
| **GOG** | Unofficial: GOG OAuth (`auth.gog.com`), then `embed.gog.com/user/data/games` and product details | Registry `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\<id>`; or read GOG Galaxy's `galaxy-2.0.db` (SQLite) | Run the game exe directly (GOG games are DRM-free) or `goggalaxy://openGameView/<id>` | Galaxy URL scheme, or later download installers directly (DRM-free) |
| **Ubisoft Connect (Uplay)** | Unofficial: Ubisoft "ubiservices" API after login; or parse the client's local `cache/configuration` file | Registry `HKLM\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs\<id>` | `uplay://launch/<id>/0` | `uplay://install/<id>` |
| **EA app** (formerly Origin) | Unofficial EA GraphQL API after login | `C:\ProgramData\EA Desktop\InstallData\` and registry entries | `origin2://game/launch?offerIds=<id>` | Open EA app |
| **Battle.net** | No reliable owned-games API: show installed games plus a fixed list of known Blizzard titles | `C:\ProgramData\Battle.net\Agent\product.db` (protobuf) | `battlenet://<ProductCode>` or `Battle.net.exe --exec="launch <code>"` | Open Battle.net |
| **Xbox / Microsoft Store / Game Pass** | Xbox Live title history after Microsoft sign-in (unofficial); Game Pass catalog is public JSON | `Get-AppxPackage` (PowerShell) filtered to games; `.GamingRoot` files on each drive for `XboxGames` folders | `shell:AppsFolder\<AUMID>` | `ms-windows-store://pdp/?productid=<id>` |

### Tier 2

| Store | Notes |
|---|---|
| **Amazon Games / Prime Gaming** | Installed: `%LocalAppData%\Amazon Games\Data\Games\Sql\GameInstallInfo.sqlite`. Owned: unofficial API (see **Nile**). Launch: `amazon-games://play/<id>`. |
| **itch.io** | **Official** API with a user API key (`/profile/owned-keys`). Installed: itch app's `butler.db` (SQLite). |
| **Humble Bundle** | Unofficial library API after login. Mostly keys for other stores plus DRM-free downloads. Used to tag games as "owned as key". |
| **Rockstar Games Launcher** | Registry entries per title; launch with `Launcher.exe -launchTitleInFolder`. No owned-games API. |
| **Riot Games** | Fixed list (League, Valorant, LoR). Launch `RiotClientServices.exe --launch-product=<id>`. |
| **Indiegala, Legacy Games, Oculus/Meta, Paradox** | Local install detection only at first. |

### Tier 3 (non-store sources)
- **Emulators**: RetroArch, Dolphin, PCSX2, RPCS3, Yuzu-forks, etc. Scan ROM folders, launch with per-emulator command templates.
- **Manual / DRM-free games**: user adds any exe, or Gamut scans a folder.
- **Linux / Steam Deck**: Steam (native + Proton), Heroic's and Lutris's library files.

---

## 4. Architecture

```
┌─────────────────────────────── Gamut Desktop App ───────────────────────────────┐
│                                                                                  │
│  UI (React + TypeScript)   Library grid · Game page · Filters · Big Picture mode  │
│            │  commands / events                                                  │
│  ──────────▼──────────────────────────────────────────────────────────────────── │
│  Core (Rust, Tauri backend)                                                      │
│   ├─ Library service      merge, dedupe, collections, search                     │
│   ├─ Sync scheduler       runs connectors, diffs results                         │
│   ├─ Launcher service     start game, watch process, record playtime             │
│   ├─ Metadata service     IGDB / SteamGridDB / store data, image cache           │
│   ├─ Credential vault     tokens in Windows Credential Manager / macOS Keychain  │
│   └─ SQLite database      games, sources, metadata, playtime, settings           │
│            │  Connector interface                                                │
│  ──────────▼──────────────────────────────────────────────────────────────────── │
│  Connectors: Steam · Epic · GOG · Ubisoft · EA · Battle.net · Xbox · Amazon · …  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Tech stack (recommended)
- **Tauri 2** (Rust backend + web UI): small install (~10 MB vs ~150 MB for Electron), fast, has easy access to the registry and file system, and runs on Windows, macOS, and Linux.
- **React + TypeScript + Tailwind** for the UI; **Framer Motion** for animation; **TanStack Virtual** so large libraries (5,000+ games) scroll smoothly.
- **SQLite** (`sqlx` or `rusqlite`) for the local database.
- **keyring** crate for storing login tokens securely.
- Alternative: Electron + Node, if you'd rather write everything in TypeScript. That makes it easier to reuse Heroic's code, but the app will be larger.

### Connector interface

```rust
#[async_trait]
trait Connector {
    fn id(&self) -> &'static str;                         // "steam", "epic", …
    fn capabilities(&self) -> Capabilities;               // owned? installed? install? playtime?
    async fn login(&self, ui: &LoginUi) -> Result<Session>;   // opens the store's own login webview
    async fn owned_games(&self, s: &Session) -> Result<Vec<StoreGame>>;
    async fn installed_games(&self) -> Result<Vec<InstalledGame>>;
    async fn launch(&self, game: &StoreGame) -> Result<LaunchHandle>;
    async fn install(&self, game: &StoreGame) -> Result<()>;
    async fn uninstall(&self, game: &StoreGame) -> Result<()>;
}
```

Connectors start as built-in Rust modules. A later phase can add an external plugin format (a small JSON-over-stdin protocol, like GOG Galaxy's) so the community can write connectors in any language.

### Data model (core tables)

- `games`: one row per *real* game (title, slug, IGDB id, release date, description, genres).
- `game_sources`: one row per store copy (`game_id`, `store`, `store_game_id`, `owned`, `installed`, `install_path`, `size`, `last_played`, `store_playtime`).
- `artwork`: cover, hero, logo, icon, screenshots (local cached path + source URL).
- `play_sessions`: start, end, `game_source_id`, for Gamut's own playtime tracking.
- `collections`, `collection_games`, `tags`: user organisation.
- `accounts`: connected store accounts (tokens stay in the OS keychain, not in this table).

### Merging duplicates
1. Match by known IDs first: IGDB maps Steam/GOG/Epic IDs to one game ("external games").
2. Otherwise compare a normalised title (lowercase, remove ™ ® editions and punctuation) plus release year.
3. Let the user merge or split games manually. Manual choices always win.
4. When launching a game owned in several places, use the installed copy; if more than one is installed, use the user's preferred store.

---

## 5. Making it look nice

### Metadata and artwork sources
| Source | Gives | Access |
|---|---|---|
| **IGDB** (owned by Twitch) | Descriptions, genres, release dates, ratings, store ID mappings | Free, Twitch developer app (client ID + secret) |
| **SteamGridDB** | Community covers, heroes, logos, icons (great quality, covers non-Steam games too) | Free API key |
| **Steam store / CDN** | `library_600x900.jpg`, `library_hero.jpg`, `logo.png` per appid | Public |
| **Store APIs** (GOG, Epic) | Official art returned with the library data | Through connectors |
| **HowLongToBeat** | Completion time estimates | Unofficial, optional |

All images are downloaded once, resized, and cached on disk, so browsing is instant and works offline.

### UI screens
1. **Library grid**: tall cover art, hover to show a short video or animated hero; badges for store and installed state; fast search; filters for store, installed, genre, tag, playtime, and recently added.
2. **Game page**: full-width hero image with logo on top, a big Play / Install button, store selector if owned in more places, playtime, achievements (later), description, screenshots.
3. **Home / shelf view**: "Continue playing", "Recently added", "Never played", "Random pick", user collections, displayed as horizontal rows.
4. **Big Picture / couch mode**: full screen, controller navigation (gamepad API), large text.
5. **Settings**: connected accounts, library folders, preferred stores, theme.

### Visual style
- Dark theme by default, with accent colour taken from each game's cover art.
- Glass-style panels over a blurred hero background.
- Smooth transitions between grid and game page (shared-element animation of the cover).
- Theme system built on CSS variables, so users can make their own themes.

---

## 6. Launching and playtime

1. Gamut calls the connector's `launch`, which usually opens the store URL (for example `steam://rungameid/…`).
2. Because the store client actually starts the game, Gamut then **watches for the game's process** by matching processes started from the game's install folder.
3. When it appears: mark "Playing", start a session, optionally minimise Gamut. When it exits: save the session and add to playtime.
4. Playtime shown = the store's reported time (where available) or Gamut's own tracked time, whichever is larger.
5. Optional: pre-launch / post-launch scripts per game (for example, change resolution or start a mod manager).

---

## 7. Security and terms of service

- **Never ask for or store store passwords.** Every login happens in the store's own login page inside a webview; Gamut only keeps the resulting token, in the OS keychain.
- Only read local launcher files; never modify them.
- Unofficial APIs may break, and using them is a grey area in some stores' terms. They are read-only and used the same way Playnite, Heroic, and GOG Galaxy use them, but this is a personal project risk to be aware of. Keep each connector isolated so a broken one never breaks the app.
- API keys for IGDB / SteamGridDB: each user enters their own, or a small proxy server holds them if the app is ever distributed.

---

## 8. Roadmap

Each phase ends with something usable.

### Phase 0: Setup (≈1 week)
- Tauri + React project, SQLite schema and migrations, CI (lint, test, build for Windows).
- Connector trait and a fake "demo" connector for UI work.

### Phase 1: Installed games, one-click launch (≈2–3 weeks)
- Installed-game detection for **Steam, Epic, GOG, Ubisoft, EA, Battle.net**.
- Basic grid with Steam CDN art + SteamGridDB, game page, launch via URL schemes.
- **Result:** every installed game on the PC in one launcher.

### Phase 2: Full owned libraries (≈3–4 weeks)
- Account login and owned-game sync for **Steam, GOG, Epic**, then **Ubisoft, EA, Xbox**.
- Install / uninstall buttons via the store clients.
- Duplicate merging with IGDB, background sync.
- **Result:** the whole library, installed or not.

### Phase 3: Make it beautiful (≈3 weeks)
- Home shelves, filters, collections, tags, search.
- Animated transitions, colour accents from covers, themes.
- Playtime tracking through process watching.

### Phase 4: More sources (ongoing)
- Amazon, itch.io, Humble, Rockstar, Riot, emulators, manual games.
- Big Picture mode with controller support.

### Phase 5: Extras (later)
- Achievements (Steam has an official API; others vary).
- External plugin protocol for community connectors.
- Cloud backup of library settings / collections, phone companion viewer.
- macOS and Linux builds (Steam, GOG, Epic via Heroic tools, Lutris).

---

## 9. Testing

- **Connector tests** use recorded fixtures: sample `libraryfolders.vdf`, Epic `.item` manifests, GOG registry exports, API JSON responses. They run in CI without real accounts.
- **Merge tests**: a list of tricky title pairs ("DOOM (2016)" vs "DOOM", "Witcher 3 GOTY" vs "The Witcher 3: Wild Hunt").
- **Manual test checklist** per store on a real Windows machine for login, launch, and install.
- UI: component tests (Vitest + Testing Library) and a few Playwright end-to-end tests against the demo connector.

---

## 10. Open questions

1. **New app or Playnite extension?** (Section 2.) This plan assumes a new app.
2. **Which OS first?** Plan assumes Windows first, since most store clients only run there.
3. **Personal use only, or public release?** Public release means handling API keys through a proxy and being more careful with unofficial APIs.
4. **Language preference:** Rust + TypeScript (Tauri) or all-TypeScript (Electron)?
5. **Which stores do you actually use?** Their order in Phases 1–2 can follow that.

---

## 11. Proposed repo layout

```
gamut/
├─ src-tauri/                # Rust core
│  ├─ src/
│  │  ├─ connectors/         # steam.rs, epic.rs, gog.rs, ubisoft.rs, ea.rs, battlenet.rs, xbox.rs, …
│  │  ├─ library/            # merge, dedupe, search
│  │  ├─ launcher/           # launch + process watch + playtime
│  │  ├─ metadata/           # igdb.rs, steamgriddb.rs, image cache
│  │  ├─ db/                 # schema, migrations, queries
│  │  └─ main.rs
│  └─ tests/fixtures/        # sample manifests and API responses
├─ src/                      # React UI
│  ├─ screens/               # Home, Library, GamePage, Settings, BigPicture
│  ├─ components/
│  └─ theme/
├─ docs/PLAN.md
└─ README.md
```
