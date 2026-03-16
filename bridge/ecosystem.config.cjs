// PM2 設定ファイル — ブリッジサーバーのプロセス管理
module.exports = {
  apps: [
    {
      name: "avatar-code-bridge",
      interpreter: "node",
      script: "src/index.ts",
      node_args: "--import tsx",
      cwd: __dirname,
      // ファイル変更検知で自動再起動（git pull後に自動反映）
      watch: ["src"],
      watch_delay: 1000,
      ignore_watch: ["node_modules", "*.log"],
      // クラッシュ時の自動再起動
      autorestart: true,
      max_restarts: 10,
      min_uptime: "5s",
      restart_delay: 2000,
      // 環境変数（.envはdotenvで読み込み済み）
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
