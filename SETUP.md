# AvatarCode Setup Guide

このファイルはClaude Codeが読んで対話的にセットアップを進めるためのガイドです。
Claude Codeに「Read SETUP.md and set up AvatarCode for me」と伝えるだけでセットアップが始まります。

---

## Claude Code向け指示

このファイルを読んだClaude Codeは以下の手順でユーザーと対話しながらセットアップを進めてください。

1. まず **ステップ0: 前提条件の確認** から始める
2. 各ステップで必要な情報をユーザーに質問し、確認を取ってから実行する
3. エラーが発生した場合はその場で解決してから次に進む
4. 完了したら動作確認の手順を案内する

---

## ステップ 0: 前提条件の確認

以下がインストールされているか確認してください。

```bash
node --version        # v18以上
npm --version
wrangler --version    # なければ: npm i -g wrangler
cloudflared --version # なければ後述のインストール手順を参照
```

**Cloudflaredのインストール（未インストールの場合）:**
- Windows: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
- macOS: `brew install cloudflared`
- Linux: `curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && sudo dpkg -i cloudflared.deb`

**Claude Codeの確認:**
```bash
claude --version  # Claude Codeがインストールされていること
```

---

## ステップ 1: デプロイモードの選択

ユーザーに以下を質問してください:

> **どのモードで使用しますか？**
> 1. **ローカルモード** — 同じPC内からのみアクセス（最もシンプル）
> 2. **Cloudflareフリー枠モード** ⭐ — スマホ・タブレットからもアクセス可能（カスタムドメイン不要）
> 3. **カスタムドメインモード** — 独自ドメインを使用

---

## ステップ 2: 環境変数の収集

ユーザーに以下の情報を質問してください（モードによって必要なものが異なります）:

### 全モード共通
- **BRIDGE_SECRET**: ブリッジ認証キー（任意の安全なランダム文字列。例: `openssl rand -hex 32` で生成）
- **API_KEY**: フロントエンド認証キー（BRIDGE_SECRETとは別の値）
- **GEMINI_API_KEY**: Gemini APIキー（https://aistudio.google.com/app/apikey から取得、アバター生成に使用）
- **PROJECTS_DIR**: Claudeに操作させたいプロジェクトが入っているフォルダの**絶対パス**を教えてください
  - 例（Windows）: `C:\Users\YourName\projects`
  - 例（Mac/Linux）: `/home/yourname/projects`

### Cloudflareフリー枠モード / カスタムドメインモードの場合
- **Cloudflareアカウント**: `wrangler login` でログイン済みか確認
- **トンネル名**: Cloudflare Tunnelに付ける名前（例: `avatar-code-bridge`）
- **（カスタムドメインのみ）ドメイン名**: Cloudflareで管理しているドメイン

---

## ステップ 3: 設定ファイルの作成

以下のコマンドを実行してください:

```bash
# Worker設定
cp worker/wrangler.toml.example worker/wrangler.toml
cp worker/.dev.vars.example worker/.dev.vars

# Bridge設定
cp bridge/.env.example bridge/.env

# Web設定
cp web/.env.local.example web/.env.local
```

次に各ファイルにユーザーが提供した値を書き込んでください。

**worker/.dev.vars** (ローカル開発用):
```
BRIDGE_SECRET=<ユーザーが設定した値>
API_KEY=<ユーザーが設定した値>
GEMINI_API_KEY=<ユーザーが設定した値>
BRIDGE_URL=http://localhost:3456
# Cloudflare/カスタムドメインモードのみ以下を設定（CORS制御に使用）:
# FRONTEND_URL=https://avatar-code.pages.dev
```

**bridge/.env**:
```
BRIDGE_SECRET=<BRIDGE_SECRETと同じ値>
PORT=3456
PROJECTS_DIR=<ユーザーが指定したプロジェクトフォルダの絶対パス>
WORKER_URL=<モードに応じて設定 — ローカルは不要>
FRONTEND_URL=<モードに応じて設定 — ローカルは不要>
```

**web/.env.local** (ローカルモードは空でOK):
```
VITE_API_KEY=<API_KEYと同じ値>
# Cloudflare/カスタムドメインモードのみ以下を設定:
# VITE_API_BASE=https://your-project.your-subdomain.workers.dev/api
# VITE_BRIDGE_HTTP_BASE=https://your-tunnel.cfargotunnel.com
```

---

## ステップ 4: 依存パッケージのインストール

```bash
cd bridge && npm install && cd ..
cd web && npm install && cd ..
cd worker && npm install && cd ..
```

---

## ステップ 5: Cloudflareリソースの作成

### ローカルモードの場合
このステップはスキップ可能です（`wrangler dev` でローカルD1/R2を使用）。

ただしローカルDBのマイグレーションは実行してください:
```bash
cd worker
npm run db:migrate  # ローカルD1にスキーマ適用
```

### Cloudflareフリー枠 / カスタムドメインモードの場合

```bash
# Cloudflareにログイン
wrangler login

# D1データベース作成
wrangler d1 create avatar-code-db
# 出力された database_id を worker/wrangler.toml の database_id に記入してください

# R2バケット作成
wrangler r2 bucket create avatar-code-uploads

# 本番シークレットの設定
cd worker
wrangler secret put BRIDGE_SECRET
wrangler secret put API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put FRONTEND_URL  # デプロイ後のPages URL（例: https://avatar-code.pages.dev）

# DBマイグレーション（本番）
npm run db:migrate:remote
```

---

## ステップ 6: Cloudflare Tunnelの設定

### ローカルモードの場合
スキップしてください。

### Cloudflareフリー枠 / カスタムドメインモードの場合

```bash
# Cloudflareにログイン（まだの場合）
cloudflared login

# トンネルの作成
cloudflared tunnel create avatar-code-bridge
# 出力されたトンネルIDをメモしておいてください

# 設定ファイルの作成
# ~/.cloudflared/config.yml を作成:
```

**~/.cloudflared/config.yml** の内容:
```yaml
tunnel: <トンネルID>
credentials-file: /path/to/home/.cloudflared/<トンネルID>.json

ingress:
  - hostname: avatar-code-bridge.cfargotunnel.com  # または独自ドメイン
    service: http://localhost:3456
  - service: http_status:404
```

**カスタムドメインモードのみ**: CloudflareダッシュボードでDNS CNAMEレコードを追加:
```
Type: CNAME
Name: your-bridge-subdomain
Target: <トンネルID>.cfargotunnel.com
```

---

## ステップ 7: Worker / Frontendのデプロイ

### ローカルモードの場合
スキップしてください。

### Cloudflareフリー枠 / カスタムドメインモードの場合

```bash
# Workerのデプロイ
cd worker
npm run deploy
# デプロイ後に表示される Workers URL をメモ（例: avatar-code-api.xxx.workers.dev）

# worker/wrangler.toml の BRIDGE_URL をトンネルURLに更新してから再デプロイ
# BRIDGE_URL = "https://avatar-code-bridge.cfargotunnel.com"
npm run deploy

# Frontendのデプロイ
cd ../web
npm run build
npx wrangler pages deploy dist --project-name=avatar-code --branch=master
# デプロイ後に表示される Pages URL をメモ（例: avatar-code.pages.dev）
```

デプロイ後、bridge/.env と web/.env.local の URL を実際の値に更新してください。

---

## ステップ 8: ブリッジサーバーの起動

```bash
# ブリッジを起動
cd bridge
npm run dev
```

別ターミナルで:
```bash
# Cloudflare Tunnelを起動（Cloudflareモードのみ）
cloudflared tunnel run avatar-code-bridge
```

---

## ステップ 9: 動作確認

### ローカルモードの場合

```bash
# Worker APIを起動
cd worker && npm run dev

# フロントエンドを起動
cd web && npm run dev

# ブラウザで開く
open http://localhost:5173
```

### Cloudflareモードの場合

デプロイした Pages URL をブラウザで開いてください。
例: `https://avatar-code.pages.dev`

**確認チェックリスト:**
- [ ] ページが表示される
- [ ] ヘルスチェックが「オンライン」になっている
- [ ] フォルダを追加できる
- [ ] チャットを開始できる
- [ ] ペルソナ設定画面が開く

---

## Windows 自動起動設定（オプション）

ブリッジとトンネルをPCログオン時に自動起動させたい場合:

1. `bridge/start-avatar-code.ps1` を編集し、`$BridgeDir` と `$TunnelName` を実際の値に変更
2. タスクスケジューラで以下のタスクを作成:
   - トリガー: ログオン時 + 1分遅延
   - 操作: `powershell.exe -ExecutionPolicy Bypass -File "C:\path\to\bridge\start-avatar-code.ps1"`

---

## トラブルシューティング

### チャットが「オフライン」になる
- ブリッジサーバーが起動しているか確認: `http://localhost:3456/health`
- Cloudflareモードの場合、トンネルも起動しているか確認
- `BRIDGE_URL` が正しく設定されているか確認

### CORS エラーが出る
- `worker/wrangler.toml` の `BRIDGE_URL` が正しいか確認
- `bridge/.env` の `FRONTEND_URL` と `WORKER_URL` が正しいか確認

### D1 マイグレーションエラー
```bash
# スキーマを再適用
cd worker
npm run db:migrate        # ローカル
npm run db:migrate:remote # 本番
```

### Gemini APIエラー（アバター生成時）
- `GEMINI_API_KEY` が正しく設定されているか確認
- https://aistudio.google.com/app/apikey でキーが有効か確認
