#requires -Version 7.0
<#
.SYNOPSIS
Refresh an existing DayZ Mod Studio Agent Skills installation.

.DESCRIPTION
Re-runs the safe installer with -Force for the selected agents/scope. Modes
recorded in the manifest are preserved unless -Mode is supplied. Only paths
owned by this pack are replaced.
#>
[CmdletBinding()]
param(
    [string[]]$Agents = @('all'),
    [ValidateSet('user', 'project')][string]$Scope = 'user',
    [string]$ProjectPath,
    [ValidateSet('auto', 'link', 'copy')][string]$Mode,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$install = Join-Path $PSScriptRoot 'install.ps1'
if (-not (Test-Path -LiteralPath $install -PathType Leaf)) { throw "Missing installer: $install" }

$params = @{
    Agents  = $Agents
    Scope   = $Scope
    Force   = $true
    DryRun  = $DryRun
}
if ($ProjectPath) { $params.ProjectPath = $ProjectPath }
if ($PSBoundParameters.ContainsKey('Mode')) { $params.Mode = $Mode }

$global:LASTEXITCODE = 0
& $install @params
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
exit 0
