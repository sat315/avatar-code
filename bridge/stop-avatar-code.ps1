# AvatarCode Bridge + Tunnel 停止スクリプト

Write-Host "Stopping AvatarCode services..."

# cloudflared を停止
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "Tunnel stopped"

# node (bridge) を停止 — ポート3456を使っている全プロセスを強制終了
$bridgePids = Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -ne 0 }

if ($bridgePids) {
    foreach ($procId in $bridgePids) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Write-Host "Bridge stopped (PID: $procId)"
    }
    # TIME_WAITが解放されるまで少し待つ
    Start-Sleep -Seconds 2
} else {
    Write-Host "Bridge was not running"
}

Write-Host "Done"
