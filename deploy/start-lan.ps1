#requires -Version 5.1
# Launch the Star Trek 1971 PWA on the local network.
# Resolves your LAN IP, prints a QR code, then serves src/ on port 8073.

[CmdletBinding()]
param(
    [int]$Port = 8073
)

$ErrorActionPreference = 'Stop'

$ScriptRoot = $PSScriptRoot
$ProjectRoot = Split-Path $ScriptRoot -Parent
$WebRoot = Join-Path $ProjectRoot 'src'
$ServerJs = Join-Path $ScriptRoot 'server.js'

if (-not (Test-Path $WebRoot)) {
    Write-Host "ERROR: web root not found: $WebRoot" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is required (https://nodejs.org/)" -ForegroundColor Red
    exit 1
}

# --- Resolve LAN IP ---------------------------------------------------------
function Get-LanIPv4 {
    $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.AddressState -eq 'Preferred'
        }

    $preferred = $candidates | Where-Object {
        $_.InterfaceAlias -match 'Wi-Fi' -or $_.InterfaceAlias -match 'Ethernet'
    } | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|Loopback' }

    $pick = if ($preferred) { $preferred | Select-Object -First 1 } else { $candidates | Select-Object -First 1 }
    if ($pick) { return $pick.IPAddress }
    return $null
}

$ip = Get-LanIPv4
if (-not $ip) {
    Write-Host "ERROR: couldn't auto-detect LAN IP. Check your network." -ForegroundColor Red
    exit 1
}

$url = "http://${ip}:${Port}/"

# --- Banner -----------------------------------------------------------------
Write-Host ''
Write-Host '====================================================' -ForegroundColor Green
Write-Host '   STAR TREK 1971 -- Local Network Launcher' -ForegroundColor Green
Write-Host '====================================================' -ForegroundColor Green
Write-Host ''
Write-Host '   Open on this machine:  ' -NoNewline
Write-Host "http://localhost:${Port}/" -ForegroundColor White
Write-Host '   Open from your phone:  ' -NoNewline
Write-Host $url -ForegroundColor White
Write-Host ''
Write-Host '   Scan this QR from your phone (same Wi-Fi):' -ForegroundColor Gray
Write-Host ''

# --- QR Code (npx qrcode-terminal) ------------------------------------------
try {
    & npx --yes qrcode-terminal $url
} catch {
    Write-Host "   (couldn't render QR -- 'npx qrcode-terminal' failed.)" -ForegroundColor DarkYellow
    Write-Host "   Type the URL into your phone's browser instead." -ForegroundColor DarkYellow
}

Write-Host ''
Write-Host '   On your phone after the page loads:' -ForegroundColor Gray
Write-Host '     iOS Safari:  Share -> "Add to Home Screen"' -ForegroundColor Gray
Write-Host '     Android Chrome: menu -> "Install app" or "Add to Home"' -ForegroundColor Gray
Write-Host ''
Write-Host '   Press Ctrl+C to stop the server.' -ForegroundColor DarkGray
Write-Host ''
Write-Host '----------------------------------------------------' -ForegroundColor DarkGray

# --- Run the server (blocks; Ctrl+C tears down the Node process) ------------
& node $ServerJs $Port $WebRoot
