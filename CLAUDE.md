# CLAUDE.md — AvatarCode

## プロジェクト概要
「自分だけのAIキャラでClaude Codeをリモート操作できるWebクライアント」
AIキャラクターのペルソナ（性格）とアバター（画像）を自由にカスタマイズして、
ブラウザからClaude Codeをリモート操作できるOSSプロジェクト。

## アーキテクチャ
```
ブラウザ ←WebSocket→ Cloudflare Tunnel → ブリッジサーバー(ローカルPC) → Agent SDK → Claude Code
```

## Tech Stack
- **Worker**: Cloudflare Workers + Hono
- **DB**: Cloudflare D1 (SQLite)
- **Frontend**: React (Vite) + Tailwind
- **Bridge**: Node.js + @anthropic-ai/claude-agent-sdk
- **通信**: WebSocket（双方向）
- **画像生成**: Gemini API / 手動アップロード
- **トンネル**: Cloudflare Tunnel
- **Language**: TypeScript

## プロジェクト構造
```
avatar-code/
├── worker/                   # Cloudflare Workers (API)
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   └── db/
│   │       └── schema.sql
│   ├── wrangler.toml.example # ← .example のみgit追跡
│   └── .dev.vars.example
├── web/                      # React Frontend
│   └── src/
│       ├── pages/
│       ├── hooks/
│       └── components/
├── bridge/                   # ブリッジサーバー（ローカルPC）
│   ├── src/
│   │   └── index.ts
│   └── .env.example
├── CLAUDE.md
├── README.md
├── SETUP.md
└── LICENSE
```

## 環境変数

### Worker (`worker/.dev.vars` / Wrangler Secrets)
| 変数名 | 用途 |
|--------|------|
| `BRIDGE_SECRET` | ブリッジ認証キー |
| `API_KEY` | フロントエンド認証キー |
| `GEMINI_API_KEY` | Gemini API（アバター生成用） |

### Web (`web/.env.local`)
| 変数名 | 用途 |
|--------|------|
| `VITE_API_KEY` | Worker認証キー（Worker側と同じ値） |
| `VITE_API_BASE` | WorkerのベースURL |
| `VITE_BRIDGE_HTTP_BASE` | ブリッジサーバーのベースURL |

### Bridge (`bridge/.env`)
| 変数名 | 用途 |
|--------|------|
| `BRIDGE_SECRET` | ブリッジ認証キー（Worker側と同じ値） |
| `PORT` | ブリッジサーバーのポート（デフォルト: 3456） |
| `PROJECTS_DIR` | プロジェクト置き場の絶対パス（例: `C:\Users\YourName\projects`） |

## よく使うコマンド

| 操作 | コマンド | ディレクトリ |
|------|---------|-------------|
| フロントdev | `npm run dev` | web/ |
| フロントbuild | `npm run build` | web/ |
| API dev | `npm run dev` | worker/ |
| API deploy | `npm run deploy` | worker/ |
| ブリッジ起動 | `npm run dev` | bridge/ |
| トンネル起動 | `cloudflared tunnel run <tunnel-name>` | どこでも |
| DBマイグレーション(local) | `npm run db:migrate` | worker/ |
| DBマイグレーション(remote) | `npm run db:migrate:remote` | worker/ |

※ ブリッジ＋トンネル両方起動してないとチャットはオフライン表示になる

## 設計方針
- UI: Discordライクなシンプルモダン
- DX優先、過度な最適化はしない
- セキュリティ: `/api/deploy` エンドポイントはデフォルト無効
