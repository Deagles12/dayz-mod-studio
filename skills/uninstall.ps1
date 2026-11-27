#requires -Version 7.0
<#
.SYNOPSIS
Remove only the DayZ Mod Studio skills owned by this installer.

.DESCRIPTION
Reads the install manifest, verifies each target is a link to the recorded
source or a copy carrying the pack marker, and removes only those paths.
Third-party skill directories are never touched. User and project entries can
be filtered; -ProjectPath limits removal to that project.

.PARAMETER Agents
codex, opencode, claude, hermes, or all (default all).

.PARAMETER Scope
user, project, or all (default all).

.PARAMETER ProjectPath
Limit removal to installs under this project. Required with -Scope project.

.PARAMETER DryRun
Print the paths that would be removed without changing anything.
#>
[CmdletBinding()]
param(
    [string[]]$Agents = @('all'),
    [ValidateSet('user', 'project', 'all')][string]$Scope = 'all',
    [string]$ProjectPath,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$PackRoot = $PSScriptRoot
$PackId = 'dayz-mod-studio-agent-skills'
$AllAgents = @('codex', 'opencode', 'claude', 'hermes')
$HermesCategory = 'dayz-mod-studio'

function Fail([string]$Message) { throw $Message }

function Get-UserHome {
    $homePath = [Environment]::GetFolderPath('UserProfile')
    if (-not $homePath) { $homePath = $HOME }
    if (-not $homePath) { Fail 'Cannot resolve the user home directory.' }
    return [IO.Path]::GetFullPath($homePath)
}

function Get-StateRoot {
    if ($env:LOCALAPPDATA) { return (Join-Path $env:LOCALAPPDATA 'DayZ Mod Studio Skills') }
    if ($env:XDG_STATE_HOME) { return (Join-Path $env:XDG_STATE_HOME 'dayz-mod-studio-skills') }
    return (Join-Path (Get-UserHome) '.local/state/dayz-mod-studio-skills')
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
            if ($AllAgents -notcontains $name) { Fail "Unknown agent '$name'." }
            if (-not $selected.Contains($name)) { $selected.Add($name) }
        }
    }
    if ($selected.Count -eq 0) { Fail 'No agents selected.' }
    return $selected.ToArray()
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
        $candidate = if ([IO.Path]::IsPathRooted($text)) { $text } else { Join-Path (Split-Path -Parent $Path) $text }
        try { $result.Add([IO.Path]::GetFullPath($candidate)) } catch { }
    }
    return $result.ToArray()
}

function Test-Owned([string]$Path, [string[]]$AllowedSources) {
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

function Test-Under([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    return $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

try {
    $selected = Select-Agents $Agents
    $projectRoot = $null
    if ($ProjectPath) {
        $resolvedProject = Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop
        if (-not (Test-Path -LiteralPath $resolvedProject.Path -PathType Container)) { Fail "Project path is not a directory: $ProjectPath" }
        $projectRoot = [IO.Path]::GetFullPath($resolvedProject.Path)
    }
    if ($Scope -eq 'project' -and -not $projectRoot) {
        Fail '-ProjectPath is required with -Scope project.'
    }

    $manifestPath = Join-Path (Get-StateRoot) 'install.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Write-Host "No install manifest: $manifestPath"
        exit 0
    }
    try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json -AsHashtable
    } catch {
        Fail "Refusing to modify an unreadable install manifest: $manifestPath"
    }
    if ($manifest['pack'] -and $manifest['pack'] -ne $PackId) {
        Fail "Manifest belongs to '$($manifest['pack'])'."
    }

    $entries = [Collections.ArrayList]::new()
    foreach ($entry in @($manifest['installs'])) { if ($null -ne $entry) { [void]$entries.Add($entry) } }
    $keep = [Collections.ArrayList]::new()
    $failed = 0
    $removed = 0

    foreach ($entry in $entries) {
        $agent = [string]$entry['agent']
        $entryScope = [string]$entry['scope']
        $path = [string]$entry['path']
        if (-not $path) { Write-Warning "Skipping malformed manifest entry for $agent"; $failed++; [void]$keep.Add($entry); continue }
        if ($selected -notcontains $agent) { [void]$keep.Add($entry); continue }
        if ($Scope -ne 'all' -and $entryScope -ne $Scope) { [void]$keep.Add($entry); continue }
        if ($projectRoot -and -not (Test-Under $path $projectRoot)) { [void]$keep.Add($entry); continue }

        $allowed = @([string]$entry['source'])
        if (-not $allowed[0]) { $allowed = @($PackRoot) }
        if (-not (Test-Path -LiteralPath $path)) {
            Write-Host "Already absent: $path"
            $removed++
            continue
        }
        if (-not (Test-Owned -Path $path -AllowedSources $allowed)) {
            Write-Warning "Refusing to remove unowned path: $path"
            $failed++
            [void]$keep.Add($entry)
            continue
        }
        if ($DryRun) {
            Write-Host "[dry-run] remove $path"
            $removed++
            [void]$keep.Add($entry)
            continue
        }
        try {
            $item = Get-Item -LiteralPath $path -Force
            if ($item.LinkType) { [IO.Directory]::Delete($path, $false) } else { Remove-Item -LiteralPath $path -Recurse -Force }
            $parent = Split-Path -Parent $path
            if ($agent -eq 'hermes' -and (Split-Path -Leaf $parent) -eq $HermesCategory -and (Test-Path -LiteralPath $parent)) {
                if (-not (Get-ChildItem -LiteralPath $parent -Force | Select-Object -First 1)) {
                    [IO.Directory]::Delete($parent, $false)
                }
            }
            Write-Host "Removed: $path"
            $removed++
        } catch {
            Write-Warning "Could not remove $($path): $($_.Exception.Message)"
            $failed++
            [void]$keep.Add($entry)
        }
    }

    if (-not $DryRun) {
        $data = [ordered]@{
            schema   = 1
            pack     = $PackId
            version  = (Get-Content -LiteralPath (Join-Path $PackRoot 'VERSION') -Raw).Trim()
            updated  = [DateTime]::UtcNow.ToString('o')
            installs = @($keep | Sort-Object { [string]$_['path'] })
        }
        $json = $data | ConvertTo-Json -Depth 10
        $temp = Join-Path (Split-Path -Parent $manifestPath) ('.install-' + [guid]::NewGuid().ToString('N') + '.json')
        [IO.File]::WriteAllText($temp, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temp -Destination $manifestPath -Force
        Write-Host "Manifest: $manifestPath"
    }
    Write-Host "Removed $removed path(s); $failed refusal(s)."
    if ($failed -gt 0) { exit 1 }
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
