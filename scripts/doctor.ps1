<#
.SYNOPSIS
  Diagnose Ide-IM-Skill bridge environment on Windows.
.DESCRIPTION
  Checks Node.js, CLI availability, config, build state, log health, etc.
  Usage: powershell -File scripts\doctor.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'

$CtiHome    = if ($env:CTI_HOME) { $env:CTI_HOME } else { Join-Path $env:USERPROFILE '.ide-im' }
$ConfigFile = Join-Path $CtiHome 'config.env'
$PidFile    = Join-Path $CtiHome 'runtime' 'bridge.pid'
$LogFile    = Join-Path $CtiHome 'logs' 'bridge.log'
$SkillDir   = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

$Pass = 0
$Fail = 0

function Report {
    param([string]$Label, [bool]$Ok)
    if ($Ok) {
        Write-Host "[OK]   $Label"
        $script:Pass++
    } else {
        Write-Host "[FAIL] $Label"
        $script:Fail++
    }
}

function Get-ConfigValue {
    param([string]$Key)
    if (-not (Test-Path $ConfigFile)) { return $null }
    $line = Select-String -Path $ConfigFile -Pattern "^$Key=" -List | Select-Object -First 1
    if ($line) {
        return ($line.Line -replace "^$Key=", '').Trim('"', "'", ' ')
    }
    return $null
}

# ── Node.js ──
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeVer = (node -v 2>$null) -replace '^v', ''
    $major = [int]($nodeVer -split '\.')[0]
    Report "Node.js >= 20 (found v$nodeVer)" ($major -ge 20)
} else {
    Report "Node.js installed" $false
}

# ── Runtime ──
$ctiRuntime = Get-ConfigValue 'CTI_RUNTIME'
if (-not $ctiRuntime) { $ctiRuntime = 'claude' }
Write-Host "Runtime: $ctiRuntime"
Write-Host ""

# ── Cursor CLI (cursor mode) ──
if ($ctiRuntime -eq 'cursor') {
    $cursorPath = $null
    foreach ($name in @('agent', 'cursor')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { $cursorPath = $cmd.Source; break }
    }
    if (-not $cursorPath) {
        $candidates = @(
            (Join-Path $env:USERPROFILE '.cursor\bin\agent.exe'),
            (Join-Path $env:USERPROFILE '.local\bin\agent.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\cursor\agent.exe')
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) { $cursorPath = $c; break }
        }
    }
    Report "Cursor CLI (agent) available$(if ($cursorPath) { " ($cursorPath)" } else { ' (install: irm https://cursor.com/install.ps1 | iex)' })" ([bool]$cursorPath)
}

# ── Claude CLI (claude/auto modes) ──
if ($ctiRuntime -eq 'claude' -or $ctiRuntime -eq 'auto') {
    $claudePath = $null
    $claudeVer = $null
    $claudeCompat = $false

    $ctiExe = Get-ConfigValue 'CTI_CLAUDE_CODE_EXECUTABLE'
    if ($ctiExe -and (Test-Path $ctiExe)) {
        $claudePath = $ctiExe
        $claudeVer = try { & $ctiExe --version 2>&1 | Select-Object -First 1 } catch { 'unknown' }
    }

    if (-not $claudePath) {
        $cmd = Get-Command claude -ErrorAction SilentlyContinue
        if ($cmd) {
            $claudePath = $cmd.Source
            $claudeVer = try { & $claudePath --version 2>&1 | Select-Object -First 1 } catch { 'unknown' }
        }
    }

    if (-not $claudePath) {
        $candidates = @(
            (Join-Path $env:USERPROFILE '.claude\local\claude.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\claude\claude.exe'),
            (Join-Path $env:USERPROFILE '.local\bin\claude.exe')
        )
        foreach ($c in $candidates) {
            if (Test-Path $c) {
                $claudePath = $c
                $claudeVer = try { & $c --version 2>&1 | Select-Object -First 1 } catch { 'unknown' }
                break
            }
        }
    }

    if ($claudePath -and $claudeVer) {
        $major = [int](($claudeVer -replace '[^0-9.]', '') -split '\.')[0]
        $claudeCompat = $major -ge 2
    }

    if ($claudePath -and $claudeCompat) {
        Report "Claude CLI compatible ($claudeVer at $claudePath)" $true
    } elseif ($claudePath) {
        Report "Claude CLI compatible ($claudeVer at $claudePath — incompatible, need >= 2.x)" $false
    } else {
        if ($ctiRuntime -eq 'claude') {
            Report "Claude CLI available (not found)" $false
        } else {
            Report "Claude CLI available (not found — will use Codex fallback)" $true
        }
    }

    # SDK cli.js
    $sdkCli = $null
    foreach ($c in @(
        (Join-Path $SkillDir 'node_modules\@anthropic-ai\claude-agent-sdk\cli.js'),
        (Join-Path $SkillDir 'node_modules\@anthropic-ai\claude-agent-sdk\dist\cli.js')
    )) {
        if (Test-Path $c) { $sdkCli = $c; break }
    }
    if ($sdkCli) {
        Report "Claude SDK cli.js exists ($sdkCli)" $true
    } else {
        $needed = $ctiRuntime -eq 'claude'
        Report "Claude SDK cli.js exists$(if ($needed) { " (not found — run 'npm install')" } else { ' (not found — OK for auto/codex)' })" (-not $needed)
    }
}

# ── Codex checks ──
if ($ctiRuntime -eq 'codex' -or $ctiRuntime -eq 'auto') {
    $codexCmd = Get-Command codex -ErrorAction SilentlyContinue
    if ($codexCmd) {
        $codexVer = try { codex --version 2>&1 | Select-Object -First 1 } catch { 'unknown' }
        Report "Codex CLI available ($codexVer)" $true
    } else {
        $needed = $ctiRuntime -eq 'codex'
        Report "Codex CLI available$(if ($needed) { ' (not found)' } else { ' (not found — will use Claude)' })" (-not $needed)
    }

    $codexSdk = Join-Path $SkillDir 'node_modules\@openai\codex-sdk'
    if (Test-Path $codexSdk) {
        Report "@openai/codex-sdk installed" $true
    } else {
        $needed = $ctiRuntime -eq 'codex'
        Report "@openai/codex-sdk installed$(if ($needed) { " (not found — run 'npm install')" } else { ' (not found — OK)' })" (-not $needed)
    }
}

# ── dist/daemon.mjs freshness ──
$daemonMjs = Join-Path $SkillDir 'dist\daemon.mjs'
if (Test-Path $daemonMjs) {
    $bundleTime = (Get-Item $daemonMjs).LastWriteTime
    $staleSrc = Get-ChildItem -Path (Join-Path $SkillDir 'src') -Filter '*.ts' -Recurse |
        Where-Object { $_.LastWriteTime -gt $bundleTime } | Select-Object -First 1
    Report "dist/daemon.mjs is up to date" (-not $staleSrc)
} else {
    Report "dist/daemon.mjs exists (not built — run 'npm run build')" $false
}

# ── config.env ──
Report "config.env exists$(if (-not (Test-Path $ConfigFile)) { " ($ConfigFile not found)" })" (Test-Path $ConfigFile)

# ── Channel checks ──
if (Test-Path $ConfigFile) {
    $channels = Get-ConfigValue 'CTI_ENABLED_CHANNELS'

    if ($channels -match 'discord') {
        $dcToken = Get-ConfigValue 'CTI_DISCORD_BOT_TOKEN'
        if ($dcToken) {
            $validFormat = $dcToken -match '^[A-Za-z0-9_-]{20,}\.'
            Report "Discord bot token format" $validFormat
        } else {
            Report "Discord bot token configured" $false
        }
    }

    if ($channels -match 'telegram') {
        $tgToken = Get-ConfigValue 'CTI_TG_BOT_TOKEN'
        if ($tgToken) {
            try {
                $tgResult = Invoke-RestMethod -Uri "https://api.telegram.org/bot$tgToken/getMe" -TimeoutSec 5
                Report "Telegram bot token is valid" $tgResult.ok
            } catch {
                Report "Telegram bot token is valid (getMe failed)" $false
            }
        } else {
            Report "Telegram bot token configured" $false
        }
    }

    if ($channels -match 'feishu') {
        $fsAppId = Get-ConfigValue 'CTI_FEISHU_APP_ID'
        $fsSecret = Get-ConfigValue 'CTI_FEISHU_APP_SECRET'
        $fsDomain = Get-ConfigValue 'CTI_FEISHU_DOMAIN'
        if (-not $fsDomain) { $fsDomain = 'https://open.feishu.cn' }
        if ($fsAppId -and $fsSecret) {
            try {
                $body = @{ app_id = $fsAppId; app_secret = $fsSecret } | ConvertTo-Json
                $fsResult = Invoke-RestMethod -Uri "$fsDomain/open-apis/auth/v3/tenant_access_token/internal" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 5
                Report "Feishu app credentials are valid" ($fsResult.code -eq 0)
            } catch {
                Report "Feishu app credentials are valid (request failed)" $false
            }
        } else {
            Report "Feishu app credentials configured" $false
        }
    }
}

# ── Log directory ──
$logDir = Join-Path $CtiHome 'logs'
Report "Log directory exists" (Test-Path $logDir)

# ── PID file consistency ──
if (Test-Path $PidFile) {
    $pid = (Get-Content $PidFile -Raw).Trim()
    $alive = $false
    try { $null = Get-Process -Id ([int]$pid) -ErrorAction Stop; $alive = $true } catch {}
    Report "PID file consistent (PID $pid$(if ($alive) { ' is running' } else { ', process not running' }))" $alive
} else {
    Report "PID file consistency (no PID file, OK)" $true
}

# ── Recent errors in log ──
if (Test-Path $LogFile) {
    $errorCount = (Get-Content $LogFile -Tail 50 | Select-String -Pattern 'ERROR|Fatal' -AllMatches).Count
    Report "No recent errors in log (last 50 lines)" ($errorCount -eq 0)
} else {
    Report "Log file exists (not yet created)" $true
}

Write-Host ""
Write-Host "Results: $Pass passed, $Fail failed"

if ($Fail -gt 0) {
    Write-Host ""
    Write-Host "Common fixes:"
    Write-Host "  SDK/deps missing      -> cd $SkillDir; npm install"
    Write-Host "  dist/daemon.mjs stale -> cd $SkillDir; npm run build"
    Write-Host "  config.env missing    -> run setup wizard"
    Write-Host "  Stale PID file        -> daemon.ps1 stop, then start"
    exit 1
}
exit 0
