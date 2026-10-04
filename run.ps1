[CmdletBinding(PositionalBinding = $false)]
param(
    [string]$Entry = 'examples/danmaku/main.js',
    [ValidateSet('Debug','Release','RelWithDebInfo')][string]$Configuration = 'Release',
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$EngineArgs
)
$ErrorActionPreference = 'Stop'
$binary = Join-Path $PSScriptRoot "build/$Configuration/ts-stg.exe"
if (-not (Test-Path $binary)) { $binary = Join-Path $PSScriptRoot 'build/ts-stg.exe' }
if (-not (Test-Path $binary)) { throw 'Engine not built. Run ./build.ps1 first.' }
& $binary $Entry --root $PSScriptRoot @EngineArgs
if ($LASTEXITCODE -ne 0) { throw "TS-STG exited with code $LASTEXITCODE" }
