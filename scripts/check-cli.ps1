<#
.SYNOPSIS
  Check whether the required CLI for a given runtime is installed.
.DESCRIPTION
  Usage: check-cli.ps1 <runtime> [-Install]
  Exit codes:
    0 — CLI found
    1 — CLI not found (or install failed)
  With -Install: attempts automatic installation when CLI is missing.
#>
param(
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet('claude','codex','cursor','auto')]
    [string]$Runtime,

    [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Find-Cmd {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Check-Claude {
    $path = Find-Cmd 'claude'
    if ($path) {
        $ver = try { & $path --version 2>&1 | Select-Object -First 1 } catch { 'unknown' }
        Write-Output "found: $path (version: $ver)"
        return $true
    }
    $candidates = @(
        (Join-Path $env:USERPROFILE '.claude\local\claude.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\claude\claude.exe'),
        (Join-Path $env:USERPROFILE '.local\bin\claude.exe')
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $ver = try { & $c --version 2>&1 | Select-Object -First 1 } catch { 'unknown' }
            Write-Output "found: $c (version: $ver)"
            return $true
        }
    }
    Write-Output "not_found"
    return $false
}

function Check-Codex {
    $path = Find-Cmd 'codex'
    if ($path) {
        Write-Output "found: $path"
        return $true
    }
    Write-Output "not_found"
    return $false
}

function Check-Cursor {
    foreach ($name in @('agent', 'cursor')) {
        $path = Find-Cmd $name
        if ($path) {
            Write-Output "found: $path"
            return $true
        }
    }
    $candidates = @(
        (Join-Path $env:USERPROFILE '.cursor\bin\agent.exe'),
        (Join-Path $env:USERPROFILE '.local\bin\agent.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\cursor\agent.exe')
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            Write-Output "found: $c"
            return $true
        }
    }
    Write-Output "not_found"
    return $false
}

function Install-Claude {
    Write-Host "Installing Claude CLI..."
    try {
        Invoke-Expression (Invoke-RestMethod 'https://claude.ai/install.ps1')
    } catch {
        Write-Host "Install failed: $_"
        return $false
    }
    return $true
}

function Install-Codex {
    Write-Host "Installing Codex CLI..."
    npm install -g @openai/codex
}

function Install-Cursor {
    Write-Host "Installing Cursor CLI..."
    try {
        Invoke-Expression (Invoke-RestMethod 'https://cursor.com/install.ps1')
    } catch {
        Write-Host "Install failed: $_"
        return $false
    }
    return $true
}

function Try-CheckAndInstall {
    param([string]$Name)

    $result = switch ($Name) {
        'claude' { Check-Claude }
        'codex'  { Check-Codex }
        'cursor' { Check-Cursor }
    }
    $found = $result -match '^found:'
    if ($found) {
        Write-Host "${Name}: $result"
        return $true
    }

    Write-Host "${Name}: not found"
    if ($Install) {
        switch ($Name) {
            'claude' { Install-Claude | Out-Null }
            'codex'  { Install-Codex | Out-Null }
            'cursor' { Install-Cursor | Out-Null }
        }
        $result2 = switch ($Name) {
            'claude' { Check-Claude }
            'codex'  { Check-Codex }
            'cursor' { Check-Cursor }
        }
        $found2 = $result2 -match '^found:'
        if ($found2) {
            Write-Host "${Name}: $result2 (after install)"
            return $true
        }
        Write-Host "${Name}: install failed"
    }
    return $false
}

switch ($Runtime) {
    'claude' {
        if (-not (Try-CheckAndInstall 'claude')) { exit 1 }
    }
    'codex' {
        if (-not (Try-CheckAndInstall 'codex')) { exit 1 }
    }
    'cursor' {
        if (-not (Try-CheckAndInstall 'cursor')) { exit 1 }
    }
    'auto' {
        $claudeOk = Try-CheckAndInstall 'claude'
        $codexOk = Try-CheckAndInstall 'codex'
        if (-not $claudeOk -and -not $codexOk) {
            Write-Host "auto: neither claude nor codex found"
            exit 1
        }
    }
}
