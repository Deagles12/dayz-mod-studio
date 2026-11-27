#requires -Version 7.0
<#
.SYNOPSIS
Install the DayZ Mod Studio Agent Skills pack for one or more agent hosts.

.DESCRIPTION
Installs each skill directory into the agent's documented skills root. The
default is a directory junction/symlink to this pack (single source), with a
copy fallback. Existing paths are never replaced unless this installer owns
them (manifest entry plus link target or copy marker).

.PARAMETER Agents
codex, opencode, claude, hermes, or all. Comma-separated or repeated.

.PARAMETER Scope
user (default) or project. Project requires -ProjectPath.

.PARAMETER Mode
auto (junction/symlink, copy fallback), link, or copy. When omitted, an
existing owned install keeps its recorded mode; new installs use auto.

.PARAMETER Force
Refresh an owned install even when version and link/marker look current.

.PARAMETER DryRun
Print actions without changing files or the manifest.
#>
[CmdletBinding()]
param(
    [string[]]$Agents = @('all'),
    [ValidateSet('user', 'project')][string]$Scope = 'user',
    [string]$ProjectPath,
    [ValidateSet('auto', 'link', 'copy')][string]$Mode,
    [switch]$Force,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PackRoot = $PSScriptRoot
$PackId = 'dayz-mod-studio-agent-skills'
$Version = (Get-Content -LiteralPath (Join-Path $PackRoot 'VERSION') -Raw).Trim()
$AllAgents = @('codex', 'opencode', 'claude', 'hermes')
$HermesCategory = 'dayz-mod-studio'

function Fail([string]$Message) { throw $Message }

function Get-UserHome {
    $homePath = [Environment]::GetFolderPath('UserProfile')
    if (-not $homePath) { $homePath = $HOME }
    if (-not $homePath) { Fail 'Cannot resolve the user home directory.' }
    return [IO.Path]::GetFullPath($homePath)
}

function Resolve-Project {
    if (-not $ProjectPath) { Fail '-ProjectPath is required with -Scope project.' }
    $resolved = Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.Path -PathType Container)) {
        Fail "Project path is not a directory: $ProjectPath"
    }
    return [IO.Path]::GetFullPath($resolved.Path)
}

function Select-Agents([string[]]$Values) {
    $selected = [Collections.Generic.List[string]]::new()
    foreach ($value in $Values) {
        foreach ($part in ([string]$value).Split(',')) {
            $name = $part.Trim().ToLowerInvariant()
            if (-not $name) { continue }
            if ($name -eq 'all') {
                foreach ($agent in $AllAgents) { if (-not $selected.Contains($agent)) { $selected.Add($agent) } }
                continue
            }
            if ($AllAgents -notcontains $name) { Fail "Unknown agent '$name'. Use codex, opencode, claude, hermes, or all." }
            if (-not $selected.Contains($name)) { $selected.Add($name) }
        }
    }
    if ($selected.Count -eq 0) { Fail 'No agents selected.' }
    return $selected.ToArray()
}

function Get-AgentRoot([string]$Agent, [string]$ScopeName, [string]$ProjectRoot, [string]$HomePath) {
    $base = if ($ScopeName -eq 'project') { $ProjectRoot } else { $HomePath }
    switch ($Agent) {
        'codex' { return (Join-Path $base '.agents/skills') }
        'opencode' { return (Join-Path $base '.config/opencode/skills') }
        'claude' { return (Join-Path $base '.claude/skills') }
        'hermes' { return (Join-Path $base '.hermes/skills') }
        default { Fail "Unsupported agent: $Agent" }
    }
    return $null
}

function Get-StateRoot {
    if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA 'DayZ Mod Studio Skills') }
    if ($env:XDG_STATE_HOME) { return (Join-Path $env:XDG_STATE_HOME 'dayz-mod-studio-skills') }
    return (Join-Path (Get-UserHome) '.local/state/dayz-mod-studio-skills')
}

function Load-Manifest([string]$Path) {
    $default = [ordered]@{ schema = 1; pack = $PackId; version = $Version; updated = $null; installs = @() }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $default }
    try {
        $loaded = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json -AsHashtable
    } catch {
        Fail "Refusing to modify an unreadable install manifest: $Path"
    }
    if ($loaded -isnot [System.Collections.IDictionary]) { Fail "Invalid install manifest: $Path" }
    $manifest = [ordered]@{ schema = 1; pack = $PackId; version = $Version; updated = $null; installs = @() }
    foreach ($key in @('schema', 'pack', 'version', 'updated', 'installs')) {
        if ($loaded.Contains($key)) { $manifest[$key] = $loaded[$key] }
    }
    if ($manifest.pack -and $manifest.pack -ne $PackId) { Fail "Manifest belongs to '$($manifest.pack)', not this pack." }
    return $manifest
}

function Save-Manifest([string]$Path, [Collections.IList]$Installs) {
    $parent = Split-Path -Parent $Path
    if (-not $DryRun) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    $data = [ordered]@{
        schema   = 1
        pack     = $PackId
        version  = $Version
        updated  = [DateTime]::UtcNow.ToString('o')
        installs = @($Installs | Sort-Object { [string]$_['path'] })
    }
    $json = $data | ConvertTo-Json -Depth 10
    if ($DryRun) { Write-Host "[dry-run] manifest $Path"; return }
    $temp = Join-Path $parent ('.install-' + [guid]::NewGuid().ToString('N') + '.json')
    [IO.File]::WriteAllText($temp, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $Path -Force
}

function Get-ManifestEntry([Collections.IList]$Installs, [string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    foreach ($entry in $Installs) {
        if (-not $entry['path']) { continue }
        if ([IO.Path]::GetFullPath([string]$entry['path']) -ieq $full) { return $entry }
    }
    return $null
}

function Get-LinkTargets([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if (-not $item.LinkType) { return @() }
    $result = [Collections.Generic.List[string]]::new()
    foreach ($value in @($item.Target)) {
        if (-not $value) { continue }
        $text = [string]$value
        if ($text.StartsWith('Global\', [StringComparison]::OrdinalIgnoreCase)) { $text = $text.Substring(7) }
        if ($text.StartsWith('\??\')) { $text = $text.Substring(4) }
        $candidate = if ([IO.Path]::IsPathRooted($text)) {
            $text
        } else {
            Join-Path (Split-Path -Parent $Path) $text
        }
        try { $result.Add([IO.Path]::GetFullPath($candidate)) } catch { }
    }
    return $result.ToArray()
}

function Test-Owned([string]$Path, [string[]]$AllowedSources, $Entry) {
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $item = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    if ($item.LinkType) {
        $targets = @(Get-LinkTargets $Path)
        foreach ($target in $targets) {
            foreach ($source in $AllowedSources) {
                if ($source -and ([IO.Path]::GetFullPath($source) -ieq $target)) { return $true }
            }
        }
        return $false
    }
    if (-not $item.PSIsContainer) { return $false }
    $marker = Join-Path $Path '.dayz-mod-studio-skill'
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { return $false }
    try {
        $data = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
        return ($data.pack -eq $PackId -and $data.name -eq (Split-Path -Leaf $Path))
    } catch {
        return $false
    }
}

function New-Link([string]$Target, [string]$Source, [string]$RequestedMode) {
    $types = if ($RequestedMode -eq 'link') { @('Junction', 'SymbolicLink') } else { @('Junction', 'SymbolicLink') }
    foreach ($type in $types) {
        try {
            New-Item -ItemType $type -Path $Target -Target $Source -ErrorAction Stop | Out-Null
            return $type.ToLowerInvariant()
        } catch {
            if (Test-Path -LiteralPath $Target) { Remove-Item -LiteralPath $Target -Force -ErrorAction SilentlyContinue }
        }
    }
    return $null
}

function Copy-Skill([string]$Target, [string]$Source, [string]$Name) {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
    Copy-Item -Path (Join-Path $Source '*') -Destination $Target -Recurse -Force
    $marker = [ordered]@{
        pack      = $PackId
        name      = $Name
        version   = $Version
        source    = $Source
        installed = [DateTime]::UtcNow.ToString('o')
    }
    [IO.File]::WriteAllText((Join-Path $Target '.dayz-mod-studio-skill'), ($marker | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
}

function Remove-OwnedPath([string]$Path, [string[]]$AllowedSources, $Entry) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    if (-not (Test-Owned -Path $Path -AllowedSources $AllowedSources -Entry $Entry)) {
        Fail "Refusing to remove unowned path: $Path"
    }
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.LinkType) {
        [IO.Directory]::Delete($Path, $false)
    } else {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

function Install-Skill([string]$Agent, [string]$ScopeName, [string]$Root, [string]$Source, [Collections.IList]$Installs, [bool]$ModeWasBound) {
    $name = Split-Path -Leaf $Source
    $target = if ($Agent -eq 'hermes') { Join-Path (Join-Path $Root $HermesCategory) $name } else { Join-Path $Root $name }
    $entry = Get-ManifestEntry $Installs $target
    $allowed = @($Source)
    if ($entry -and $entry['source']) { $allowed += [string]$entry['source'] }
    $exists = Test-Path -LiteralPath $target
    $owned = if ($exists) { Test-Owned -Path $target -AllowedSources $allowed -Entry $entry } else { $false }

    if ($exists -and -not $owned) {
        Fail "Refusing to replace an unowned path: $target. Move it away or choose another scope/agent."
    }
    if ($exists -and $owned -and -not $Force -and $entry -and $entry['version'] -eq $Version) {
        $linkTargets = @(Get-LinkTargets $target)
        $sourceFull = [IO.Path]::GetFullPath($Source)
        $current = ($linkTargets -contains $sourceFull) -or ((Test-Path -LiteralPath (Join-Path $target '.dayz-mod-studio-skill')))
        if ($current) {
            Write-Host "Up to date: $target"
            return
        }
    }
    $effective = if ($ModeWasBound) { $Mode } elseif ($entry -and $entry['mode']) {
        if ($entry['mode'] -in @('junction', 'symlink', 'link')) { 'link' } else { 'copy' }
    } else { 'auto' }

    if ($DryRun) {
        Write-Host "[dry-run] $target -> $Source ($effective)"
        return
    }

    if ($exists) { Remove-OwnedPath -Path $target -AllowedSources $allowed -Entry $entry }
    if ($entry -and -not $exists) { [void]$Installs.Remove($entry) }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    $actual = $null
    if ($effective -ne 'copy') {
        $actual = New-Link -Target $target -Source $Source -RequestedMode $effective
        if ($effective -eq 'link' -and -not $actual) {
            Fail "Could not create a junction/symlink for $target. Re-run with -Mode copy."
        }
    }
    if (-not $actual) {
        Copy-Skill -Target $target -Source $Source -Name $name
        $actual = 'copy'
    }

    $record = [ordered]@{
        pack      = $PackId
        name      = $name
        agent     = $Agent
        scope     = $ScopeName
        root      = $Root
        path      = $target
        source    = $Source
        mode      = $actual
        version   = $Version
        installed = [DateTime]::UtcNow.ToString('o')
    }
    $old = Get-ManifestEntry $Installs $target
    if ($old) { [void]$Installs.Remove($old) }
    [void]$Installs.Add($record)
    Write-Host "Installed: $target ($actual)"
}

try {
    $selected = Select-Agents $Agents
    $projectRoot = if ($Scope -eq 'project') { Resolve-Project } else { $null }
    $homePath = Get-UserHome
    $stateRoot = Get-StateRoot
    $manifestPath = Join-Path $stateRoot 'install.json'
    $manifest = Load-Manifest $manifestPath
    $installs = [Collections.ArrayList]::new()
    foreach ($entry in @($manifest['installs'])) { if ($null -ne $entry) { [void]$installs.Add($entry) } }

    $sources = @(Get-ChildItem -LiteralPath $PackRoot -Directory | Where-Object {
        $_.Name -like 'dayz-mod-studio*' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') -PathType Leaf)
    } | Sort-Object Name)
    if ($sources.Count -eq 0) { Fail 'No skill directories with SKILL.md found beside this installer.' }

    $modeWasBound = $PSBoundParameters.ContainsKey('Mode')
    foreach ($agent in $selected) {
        $root = Get-AgentRoot -Agent $agent -ScopeName $Scope -ProjectRoot $projectRoot -HomePath $homePath
        Write-Host "Agent $agent -> $root"
        foreach ($sourceDir in $sources) {
            Install-Skill -Agent $agent -ScopeName $Scope -Root $root -Source $sourceDir.FullName -Installs $installs -ModeWasBound $modeWasBound
        }
    }
    Save-Manifest -Path $manifestPath -Installs $installs
    if ($DryRun) {
        Write-Host 'Dry run complete; no files or manifest were changed.'
    } else {
        Write-Host "Manifest: $manifestPath"
        Write-Host "Pack $Version installed for: $($selected -join ', ') ($Scope)."
    }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
