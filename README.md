# Star Trek 1971

A self-hosted PWA port of **Mike Mayfield's 1971 HP BASIC Star Trek** (STTR1, listed
36243 REV B 10/73, "TOTAL INTERACTION GAME -- ORIG. 20 OCT 1972"). Hand-ported from
the authentic BASIC source, themed to feel like the original ASR-33 teletype your
HP 2000 timeshare account used to spit out paper tape.

- Plain JavaScript, no framework, no build step
- Slow-print teletype output with adjustable speed
- Per-character mp3 sample for clack, plus optional movie-text and ED1000 FSK modes
- Installable as a PWA on iOS, Android, or desktop (offline play after first install)

## Layout

```
src/                 the PWA — HTML/CSS/JS, manifest, service worker, icons, mp3
reference/           original BASIC source + meatfighter's C# port (for cross-reference)
deploy/
  start-lan.ps1      LAN launcher (resolves IP, prints QR, runs server)
  server.js          tiny zero-dep Node static server
```

## Run on your local network

From PowerShell on the host machine:

```powershell
.\deploy\start-lan.ps1
```

The script:
1. Auto-detects your LAN IPv4 (preferring Wi-Fi / Ethernet adapters)
2. Prints a QR code (via `npx qrcode-terminal`)
3. Serves `src/` on `0.0.0.0:8073`

Make sure your phone is on the **same Wi-Fi network** as the PC. Scan the QR,
let the page load, then install to home screen:

- **iOS Safari** -- Share menu -> "Add to Home Screen"
- **Android Chrome** -- three-dot menu -> "Install app" / "Add to Home Screen"

Once installed it launches in standalone mode (no browser chrome, full black background).
After the first install everything is cached, so it works offline.

### Custom port

```powershell
.\deploy\start-lan.ps1 -Port 9000
```

### Windows Firewall note

The first time Node binds to the port, Windows may pop up a firewall dialog. Allow it
on private networks (your home Wi-Fi) so your phone can reach the server. If you say
no, the page will only be reachable from the host machine itself.

## In-game controls

At the `COMMAND?` prompt:

| Cmd | What it does |
|-----|--------------|
| 0 | Set course (warp) |
| 1 | Short range sensor scan |
| 2 | Long range sensor scan |
| 3 | Fire phasers |
| 4 | Fire photon torpedoes |
| 5 | Shield control |
| 6 | Damage control report |
| 7 | Library computer (galactic record / status / torpedo trajectory) |
| I | Show game instructions |
| D | Set character delay (teletype speed) |
| S | Set sound (off / mp3 clack / movie text / FSK) |
| ? | Help at any prompt |

Settings (delay + sound mode) persist across sessions via localStorage.

## Credits

- **Mike Mayfield** -- original STTR1, Centerline Engineering, 20 Oct 1972
- **Pete Turnbull** -- extracted the BASIC listing from an HP tape image, 16 Nov 2003
- **Michael Birken (meatfighter.com/startrek1971)** -- C# console port used as
  cross-reference during the JavaScript port
- Owner's nostalgia: HP timeshare teletype, college, 1973-74
