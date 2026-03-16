# AvatarCode

**Your AI character, your coding companion.**
自分だけのAIキャラでClaude Codeをリモート操作できるWebクライアント

<!-- TODO: デモGIF をここに追加 -->
<!-- ![AvatarCode Demo](docs/demo.gif) -->

> ⚠️ **Work in Progress** — Currently in active development. Feedback welcome!

---

## ✨ Features

- 🎭 **Persona & Avatar** — AIキャラクターの性格・外見を自由にカスタマイズ（着せ替え式）
- 💬 **Remote Chat** — ブラウザ/スマホからClaude Codeをリモート操作
- 🔧 **Tool Approval UI** — ツール実行を承認/拒否するリアルタイムUI
- 🔄 **Conversation Rewind** — 特定のメッセージ地点まで会話を巻き戻し
- 📁 **Project Management** — 複数フォルダ（プロジェクト）の切り替え
- 🌐 **Cloudflare-based** — Cloudflare Pages / Workers / Tunnel で完結（無料枠あり）
- 📱 **Mobile-friendly** — スマホ・タブレットからもアクセス可能

---

## 🏗️ Architecture

```
Browser ←WebSocket→ Cloudflare Tunnel → Bridge Server (local PC) → Claude Agent SDK → Claude Code
```

```
avatar-code/
├── web/      # React (Vite) + Tailwind — Cloudflare Pages
├── worker/   # Hono + D1 + R2 — Cloudflare Workers
└── bridge/   # Node.js + Claude Agent SDK — runs on your local PC
```

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Claude Code](https://claude.ai/download) installed and authenticated
- [Cloudflare account](https://cloudflare.com/) (free tier)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler`)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (Cloudflare Tunnel client)
- Gemini API key ([get one free](https://aistudio.google.com/app/apikey)) — for avatar image generation

### Setup with Claude Code (recommended)

The easiest way to get started is to let Claude Code handle the setup for you:

```bash
git clone https://github.com/YOUR_USERNAME/avatar-code.git
cd avatar-code
# Then tell Claude Code: "Read SETUP.md and set up AvatarCode for me"
```

### Manual Setup

See [SETUP.md](./SETUP.md) for step-by-step instructions.

---

## 🌐 Deploy Modes

| Mode | Access | Custom Domain | Description |
|------|--------|---------------|-------------|
| **Local** | Same PC only | Not required | `localhost` — simplest setup |
| **Cloudflare Free** ⭐ | Any device | Not required | Uses `*.pages.dev` / `*.workers.dev` / `*.cfargotunnel.com` |
| **Custom Domain** | Any device | Required | Full custom domain setup |

---

## ⚙️ Environment Variables

Copy the example files and fill in your values:

```bash
cp worker/.dev.vars.example worker/.dev.vars
cp bridge/.env.example bridge/.env
cp web/.env.local.example web/.env.local
cp worker/wrangler.toml.example worker/wrangler.toml
```

| Variable | Location | Description |
|----------|----------|-------------|
| `BRIDGE_SECRET` | worker + bridge | Shared secret for Worker ↔ Bridge auth |
| `API_KEY` | worker + web | Frontend authentication key |
| `GEMINI_API_KEY` | worker | Gemini API key for avatar generation |
| `BRIDGE_URL` | worker/wrangler.toml | Bridge server URL |
| `PROJECTS_DIR` | bridge/.env | **Absolute path** to the directory containing your projects |
| `FRONTEND_URL` | bridge/.env | Frontend URL for WebSocket origin check |
| `WORKER_URL` | bridge/.env | Worker URL for CORS |
| `VITE_API_KEY` | web/.env.local | Worker API authentication key (same as `API_KEY`) |
| `VITE_API_BASE` | web/.env.local | Worker API base URL (production) |
| `VITE_BRIDGE_HTTP_BASE` | web/.env.local | Bridge base URL (production) |

---

## 🖥️ Running Locally

```bash
# 1. Start the bridge server
cd bridge && npm install && npm run dev

# 2. Start the Cloudflare Tunnel (in a new terminal)
cloudflared tunnel run <your-tunnel-name>

# 3. Start the Worker API (in a new terminal)
cd worker && npm install && npm run dev

# 4. Start the frontend (in a new terminal)
cd web && npm install && npm run dev

# Open http://localhost:5173
```

> 💡 **Tip:** Bridge + Tunnel must both be running for chat to work.
> The UI shows an offline indicator when the bridge is unreachable.

---

## 🎭 Creating Your Persona

1. Open the app and go to **Setup**
2. Enter your AI character's name and personality (system prompt)
3. Upload or generate an avatar image (via Gemini API)
4. Start chatting!

You can switch personas and avatars anytime from the **Wardrobe** page.

---

## 📖 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS |
| API | Cloudflare Workers + Hono |
| Database | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Bridge | Node.js + `@anthropic-ai/claude-agent-sdk` |
| Transport | WebSocket |
| Tunnel | Cloudflare Tunnel |
| Avatar Generation | Google Gemini API |
| Language | TypeScript |

---

## 🔒 Security Notes

- `BRIDGE_SECRET` and `API_KEY` must be different values
- The `/api/deploy` endpoint (git pull + server restart) is included but **disabled by default** — only enable if you understand the risks
- Never commit `.env`, `.dev.vars`, or `.env.local` files

---

## 🤝 Contributing

PRs and issues welcome! Please open an issue first for large changes.

---

## 📄 License

MIT — see [LICENSE](./LICENSE)
