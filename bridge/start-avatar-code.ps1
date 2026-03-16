# AvatarCode Bridge + Tunnel 自動起動スクリプト
# タスクスケジューラから実行される想定
# 使い方: SETUP.md の「Windows自動起動設定」を参照

$LogDir = "$env:USERPROFILE\.avatar-code-logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

$Date = Get-Date -Format "yyyy-MM-dd"

# avatar-code リポジトリの bridge ディレクトリ（実際のパスに書き換えてください）
$BridgeDir = "$env:USERPROFILE\Documents\avatar-code\bridge"
$Pm2Path = (Get-Command pm2 -ErrorAction SilentlyContinue).Source
if (-not $Pm2Path) {
    $Pm2Path = "$env:APPDATA\npm\pm2.cmd"
}

# 既存プロセスを停止してから起動（二重起動防止）
Start-Process -FilePath $Pm2Path -ArgumentList "delete", "avatar-code-bridge" -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue
Start-Process -FilePath $Pm2Path -ArgumentList "start", "ecosystem.config.cjs" -WorkingDirectory $BridgeDir -WindowStyle Hidden -Wait

Write-Host "Bridge started via PM2"

# 少し待ってからトンネル起動
Start-Sleep -Seconds 3

# Cloudflare Tunnel起動（トンネル名を実際の名前に書き換えてください）
$CloudflaredPath = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $CloudflaredPath) {
    $CloudflaredPath = "$env:USERPROFILE\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
}
$TunnelName = "avatar-code-bridge"  # ← 実際のトンネル名に書き換えてください
$TunnelProcess = Start-Process -FilePath $CloudflaredPath -ArgumentList "tunnel", "run", $TunnelName -WindowStyle Hidden -RedirectStandardOutput "$LogDir\tunnel-$Date.log" -RedirectStandardError "$LogDir\tunnel-error-$Date.log" -PassThru

Write-Host "Tunnel started (PID: $($TunnelProcess.Id))"
Write-Host "Logs: PM2 logs (pm2 logs avatar-code-bridge), Tunnel: $LogDir"
