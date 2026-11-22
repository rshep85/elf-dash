# Elf Dash 🎄

A Christmas lane-runner for kids. Run, jump, dodge the fake presents, snowballs and Grumples, and grab baubles, Santas and candy canes.

See [DESIGN.md](DESIGN.md) for the game rules and the decisions behind them.

## Play it on this computer (no install)
Open `public/index.html` in a browser. Everything works, but the leaderboard is saved **on this computer only** in this mode.

## Put it online with a shared leaderboard (Netlify, free tier)
The shared leaderboard uses a Netlify Function plus Netlify Blobs, so the site has to be deployed with Git or the Netlify CLI. Drag-and-drop deploys don't include functions.

**Option A: from GitHub (easiest to update later)**
1. Push this folder to a GitHub repo.
2. In Netlify: *Add new site → Import an existing project →* pick the repo.
3. Leave the build settings empty. `netlify.toml` already says what to publish. Click Deploy.

**Option B: from this computer with the CLI** (needs [Node.js](https://nodejs.org))
```bash
npm install
npx netlify-cli login
npx netlify-cli deploy --prod     # follow the prompts to create a new site
```

To test the shared leaderboard locally before deploying: `npm install` then `npx netlify-cli dev`.

## Controls
| | Keyboard | Touch |
|---|---|---|
| Change lane | ← → (or A / D) | Swipe left / right |
| Jump | Space or ↑ (or W) | Tap or swipe up |
| Pause | P or Esc | ❚❚ button |
| Sound on/off | M | 🔊 button |

## Tweaking
All the tuning numbers (speed, lives, level lengths, how often things appear) are at the top of `public/game.js`.
