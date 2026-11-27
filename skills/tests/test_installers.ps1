#requires -Version 7.0
<#
.SYNOPSIS
Integration tests for the Windows skill installer, updater, and uninstaller.

.DESCRIPTION
Runs entirely inside a temporary directory under tests/. It uses project scope
and a private LOCALAPPDATA, so it never touches the real agent skill roots.
Both copy and junction modes are exercised; an unowned target must be refused.

.PARAMETER Keep
Keep the temporary directory for inspection.
#>
[CmdletBinding()]
param([switch]$Keep)

$ErrorActionPreference = 'Stop'
$Pack = Split-Path -Parent $PSScriptRoot
$Work = Join-Path $PSScriptRoot ('.work-' + [guid]::NewGuid().ToString('N'))
$OldLocal = $env:LOCALAPPDATA
$Failures = [Collections.Generic.List[string]]::new()

function Invoke-Installer([string]$Name, [hashtable]$Parameters) {
    $global:LASTEXITCODE = 0
    & (Join-Path $Pack $Name) @Parameters
    if ($LASTEXITCODE -notin @($null, 0)) {
        throw "$Name exited $LASTEXITCODE"
    }
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { [void]$Failures.Add($Message) }
}

function New-Project([string]$Name) {
    $project = Join-Path $Work $Name
    New-Item -ItemType Directory -Path $project -Force | Out-Null
    return $project
}

try {
    New-Item -ItemType Directory -Path $Work -Force | Out-Null

    # Copy mode: install, refresh, uninstall, and preserve a third-party skill.
    $copyProject = New-Project 'copy-project'
    $third = Join-Path $copyProject '.agents\skills\third-party'
    New-Item -ItemType Directory -Path $third -Force | Out-Null
    'third party' | Set-Content -LiteralPath (Join-Path $third 'SKILL.md')
    $env:LOCALAPPDATA = Join-Path $Work 'copy-state'
    Invoke-Installer 'install.ps1' @{ Agents = 'codex'; Scope = 'project'; ProjectPath = $copyProject; Mode = 'copy' }
    $copyRoot = Join-Path $copyProject '.agents\skills'
    $copyTarget = Join-Path $copyRoot 'dayz-mod-studio'
    Assert-True (Test-Path -LiteralPath (Join-Path $copyTarget 'SKILL.md')) 'copy install did not create SKILL.md'
    Assert-True (Test-Path -LiteralPath (Join-Path $copyTarget '.dayz-mod-studio-skill')) 'copy marker missing'
    Assert-True ((Get-ChildItem -LiteralPath $copyRoot -Directory | Where-Object Name -like 'dayz-mod-studio*').Count -eq 11) 'expected 11 copied skills'
    Invoke-Installer 'update.ps1' @{ Agents = 'codex'; Scope = 'project'; ProjectPath = $copyProject }
    Invoke-Installer 'uninstall.ps1' @{ Agents = 'codex'; Scope = 'project'; ProjectPath = $copyProject }
    Assert-True (-not (Test-Path -LiteralPath $copyTarget)) 'copy uninstall left the target'
    Assert-True (Test-Path -LiteralPath (Join-Path $third 'SKILL.md')) 'copy uninstall removed a third-party skill'
    $manifest = Get-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'DayZ Mod Studio Skills\install.json') -Raw | ConvertFrom-Json
    Assert-True (@($manifest.installs).Count -eq 0) 'manifest still has install entries after uninstall'

    # Link mode: junction/symlink, refresh, uninstall.
    $linkProject = New-Project 'link-project'
    $env:LOCALAPPDATA = Join-Path $Work 'link-state'
    Invoke-Installer 'install.ps1' @{ Agents = 'claude'; Scope = 'project'; ProjectPath = $linkProject; Mode = 'link' }
    $linkTarget = Join-Path $linkProject '.claude\skills\dayz-mod-studio'
    $link = Get-Item -LiteralPath $linkTarget -Force
    Assert-True ([bool]$link.LinkType) 'link install did not create a link'
    Invoke-Installer 'update.ps1' @{ Agents = 'claude'; Scope = 'project'; ProjectPath = $linkProject }
    Invoke-Installer 'uninstall.ps1' @{ Agents = 'claude'; Scope = 'project'; ProjectPath = $linkProject }
    Assert-True (-not (Test-Path -LiteralPath $linkTarget)) 'link uninstall left the target'

    # Unowned target: refuse and do not modify.
    $refuseProject = New-Project 'refuse-project'
    $refuseTarget = Join-Path $refuseProject '.agents\skills\dayz-mod-studio'
    New-Item -ItemType Directory -Path $refuseTarget -Force | Out-Null
    'third party' | Set-Content -LiteralPath (Join-Path $refuseTarget 'SKILL.md')
    $env:LOCALAPPDATA = Join-Path $Work 'refuse-state'
    $null = & pwsh -NoProfile -File (Join-Path $Pack 'install.ps1') -Agents codex -Scope project -ProjectPath $refuseProject -Mode copy 2>&1
    $refused = $LASTEXITCODE -eq 1
    Assert-True $refused 'installer did not exit 1 for an unowned target'
    Assert-True ((Get-Content -LiteralPath (Join-Path $refuseTarget 'SKILL.md') -Raw).Trim() -eq 'third party') 'installer modified an unowned target'

    # Dry run: no target and no manifest.
    $dryProject = New-Project 'dry-project'
    $env:LOCALAPPDATA = Join-Path $Work 'dry-state'
    Invoke-Installer 'install.ps1' @{ Agents = 'codex'; Scope = 'project'; ProjectPath = $dryProject; DryRun = $true }
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $dryProject '.agents\skills\dayz-mod-studio'))) 'dry run created a target'
    Assert-True (-not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'DayZ Mod Studio Skills\install.json'))) 'dry run created a manifest'

    if ($Failures.Count) {
        $newline = [Environment]::NewLine
        Write-Error ('Installer tests failed:' + $newline + ' - ' + ($Failures -join ($newline + ' - ')))
        exit 1
    }
    Write-Host 'Installer tests: PASS (copy, link, update, uninstall, refusal, dry-run)'
} finally {
    if ($null -eq $OldLocal) {
        Remove-Item Env:LOCALAPPDATA -ErrorAction SilentlyContinue
    } else {
        $env:LOCALAPPDATA = $OldLocal
    }
    if ($Keep) {
        Write-Host "Kept: $Work"
    } elseif (Test-Path -LiteralPath $Work) {
        Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
