[CmdletBinding()]
param(
    [ValidateSet('Debug','Release','RelWithDebInfo')][string]$Configuration = 'Release'
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath($PSScriptRoot)
Push-Location $projectRoot
try {
    & npm run build:thlib
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed; no package was created.' }
} finally { Pop-Location }
$binary = Join-Path $projectRoot "build/$Configuration/ts-stg.exe"
if (-not (Test-Path -LiteralPath $binary)) { $binary = Join-Path $projectRoot 'build/ts-stg.exe' }
if (-not (Test-Path -LiteralPath $binary)) { throw 'Build the engine with ./build.ps1 first.' }
$distributionRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
$packageName = 'TS-STG'
$entry = 'main.js'
$destination = [IO.Path]::GetFullPath((Join-Path $distributionRoot $packageName))

function Assert-DistributionPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = $distributionRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe package path: $full" }
    if ((Test-Path -LiteralPath $full) -and ((Get-Item -LiteralPath $full -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Package output must not be a junction or symbolic link: $full"
    }
}
function Copy-OwnedTree([string]$Source, [string]$Target) {
    if (-not (Test-Path -LiteralPath $Source -PathType Container)) { throw "Missing package source: $Source" }
    $links = @(Get-Item -LiteralPath $Source -Force; Get-ChildItem -LiteralPath $Source -Recurse -Force) |
        Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
    if ($links) { throw "Refusing to package linked directories/files from $Source" }
    Copy-Item -LiteralPath $Source -Destination $Target -Recurse -Force
}

if (Test-Path -LiteralPath $distributionRoot) {
    if ((Get-Item -LiteralPath $distributionRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'dist must be a real directory inside this workspace.'
    }
} else { New-Item -ItemType Directory -Path $distributionRoot | Out-Null }
Assert-DistributionPath $destination
$staging = Join-Path $distributionRoot ('.' + $packageName + '.staging.' + [Guid]::NewGuid().ToString('N'))
Assert-DistributionPath $staging
New-Item -ItemType Directory -Path $staging | Out-Null

# Assemble a fresh tree. Archive existing output intact only after success, preserving user edits/saves.
Copy-Item -LiteralPath $binary -Destination (Join-Path $staging 'ts-stg.exe')
New-Item -ItemType Directory -Path (Join-Path $staging 'packages') | Out-Null
$librarySource = Join-Path $projectRoot 'packages/thlib'
$libraryTarget = Join-Path $staging 'packages/thlib'
if (-not (Test-Path -LiteralPath (Join-Path $librarySource 'assets/reference-common/manifest.json'))) {
    throw 'The versioned shared bullet/Bomb visual pack is missing. Restore packages/thlib/assets/reference-common from Git.'
}
if (-not (Test-Path -LiteralPath (Join-Path $librarySource 'assets/touhou-common/manifest.json'))) {
    throw 'The versioned shared player/animation resource pack is missing. Restore packages/thlib/assets/touhou-common from Git.'
}
$commonManifest = Get-Content -LiteralPath (Join-Path $librarySource 'assets/touhou-common/manifest.json') -Raw | ConvertFrom-Json
foreach ($bankName in @('pl00','pl01','bullet','effect','enemy','ascii_960','front','text','title','screenswitch')) {
    $archive = $commonManifest.archives.$bankName
    if (-not $archive -or -not (Test-Path -LiteralPath (Join-Path $librarySource "assets/touhou-common/$($archive.file)"))) {
        throw "The shared application resource pack is incomplete: $bankName"
    }
}
foreach ($module in @('application','scene-transition','stage-clear','stage-transition','game','gameplay-compositor','render-order','render-queue','menu','title-background','stage-selection','dialogue','pause','game-over','hud','boss-hud','boss-phase-plan','boss-phase-timeline','boss-presentation','boss-entrance','boss-death','boss-defeat','boss-phase-clear','bullet-clear-wave','screen-shake','text-renderer','music','music-caption','music-fade','prefabs','bullet-collision','laser-collision','laser-cancellation')) {
    foreach ($extension in @('js','d.ts')) {
        if (-not (Test-Path -LiteralPath (Join-Path $librarySource "dist/touhou/$module.$extension"))) { throw "Missing public framework module: $module.$extension" }
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $librarySource 'assets/spell-common/manifest.json'))) {
    throw 'The versioned shared spell/charge/aura resource pack is missing. Restore packages/thlib/assets/spell-common from Git.'
}
New-Item -ItemType Directory -Path $libraryTarget | Out-Null
foreach ($directory in @('src','dist','assets')) { Copy-OwnedTree (Join-Path $librarySource $directory) $libraryTarget }
foreach ($file in @('package.json','README.md','LICENSE','tsconfig.json','tsconfig.base.json')) { Copy-Item -LiteralPath (Join-Path $librarySource $file) -Destination $libraryTarget }
New-Item -ItemType Directory -Path (Join-Path $staging 'docs') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs/typescript.md') -Destination (Join-Path $staging 'docs')
foreach ($document in @('native-api.md','thlib-guide.md','touhou-prefabs.md','touhou-scene-transition.md','touhou-stage-flow.md','touhou-dialogue.md','touhou-rendering.md','touhou-end-feedback.md','touhou-boss-death.md','touhou-boss-defeat.md','touhou-boss-entrance.md','touhou-boss-hud.md','touhou-item-drops.md','touhou-projectile-rules.md','touhou-marisa-bomb-release.md','touhou-reimu-bomb-release.md','touhou-music.md','touhou-player-stage-visibility.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "docs/$document") -Destination (Join-Path $staging 'docs')
}
$readmeSource = 'docs/engine-sdk.md'
Copy-Item -LiteralPath (Join-Path $projectRoot $readmeSource) -Destination (Join-Path $staging 'README.md')
foreach ($name in @('LICENSE', 'THIRD_PARTY.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $staging
}

# Release scope is a strict allowlist: engine, thlib, API documentation and licenses.
# Demo programs, assets, importers and regression fixtures never enter the SDK.
foreach ($excluded in @('games', 'examples', 'tests', 'tools', 'assets')) {
    if (Test-Path -LiteralPath (Join-Path $staging $excluded)) { throw "SDK unexpectedly contains $excluded" }
}

$noticeDirectory = Join-Path $staging 'licenses'
New-Item -ItemType Directory -Path $noticeDirectory | Out-Null
$dependencySources = @{}
$cache = Get-Content -LiteralPath (Join-Path $projectRoot 'build/CMakeCache.txt')
$runtimes = @(@{ id = 'quickjs'; version = '0.10.1'; jit = $false; linkage = 'static';
    revision = '3c9afc9943323ee9c7dbd123c0cd991448f4b6c2' })
$defaultBackend = 'quickjs'
foreach ($dependency in @('raylib', 'quickjs')) {
    $sourceDirectory = Join-Path $projectRoot "build/_deps/$dependency-src"
    $cacheEntry = $cache | Where-Object { $_ -match "^FETCHCONTENT_SOURCE_DIR_$($dependency.ToUpper()):[^=]+=." } | Select-Object -First 1
    if ($cacheEntry) { $sourceDirectory = $cacheEntry.Substring($cacheEntry.IndexOf('=') + 1) }
    $dependencySources[$dependency] = $sourceDirectory
    $license = Join-Path $sourceDirectory 'LICENSE'
    if (-not (Test-Path -LiteralPath $license)) { throw "Missing $dependency license. Package not ready." }
    Copy-Item -LiteralPath $license -Destination (Join-Path $noticeDirectory "$dependency-LICENSE")
}
$thirdPartyHeaders = Join-Path $dependencySources['raylib'] 'src/external'
if (Test-Path -LiteralPath $thirdPartyHeaders) {
    $externalDestination = Join-Path $noticeDirectory 'raylib-external'
    New-Item -ItemType Directory -Path $externalDestination | Out-Null
    Get-ChildItem -LiteralPath $thirdPartyHeaders | Copy-Item -Destination $externalDestination -Recurse -Force
}

# V8 is linked into the executable. Package its notices and exact build
# provenance, never the development headers or 41 MB static library.
$v8Enabled = $cache | Where-Object { $_ -match '^TSSTG_ENABLE_V8:BOOL=(ON|TRUE|1)$' } | Select-Object -First 1
if ($v8Enabled) {
    $v8SdkRoot = Join-Path $projectRoot 'build/v8-sdk'
    $v8SdkCacheEntry = $cache | Where-Object { $_ -match '^TSSTG_V8_SDK:[^=]+=.+' } | Select-Object -First 1
    if ($v8SdkCacheEntry) { $v8SdkRoot = $v8SdkCacheEntry.Substring($v8SdkCacheEntry.IndexOf('=') + 1) }
    $v8SdkRoot = [IO.Path]::GetFullPath($v8SdkRoot)
    $v8SdkManifestPath = Join-Path $v8SdkRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $v8SdkManifestPath -PathType Leaf)) { throw 'Missing pinned V8 SDK provenance manifest. Run tools/fetch-v8-sdk.ps1 before packaging.' }
    $v8SdkManifest = Get-Content -LiteralPath $v8SdkManifestPath -Raw | ConvertFrom-Json
    if ($v8SdkManifest.format -ne 'ts-stg-v8-sdk-v1' -or -not $v8SdkManifest.licenses) { throw 'Invalid V8 SDK provenance or license inventory.' }
    if ($v8SdkManifest.library.file -notin @('rusty_v8.lib', 'v8-host.lib') -or $v8SdkManifest.build.linkage -ne 'static') { throw 'V8 packaging requires the pinned static SDK.' }
    foreach ($requiredNotice in @('V8-LICENSE', 'rusty_v8-LICENSE')) {
        if (-not ($v8SdkManifest.licenses | Where-Object { $_.file -eq $requiredNotice })) { throw "Missing required V8 license inventory entry: $requiredNotice" }
    }
    $v8LicenseRoot = [IO.Path]::GetFullPath((Join-Path $v8SdkRoot 'licenses'))
    $v8LicensePrefix = $v8LicenseRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    foreach ($notice in $v8SdkManifest.licenses) {
        $v8NoticePath = [IO.Path]::GetFullPath((Join-Path $v8LicenseRoot $notice.file))
        if (-not $v8NoticePath.StartsWith($v8LicensePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe V8 license path: $($notice.file)" }
        if (-not (Test-Path -LiteralPath $v8NoticePath -PathType Leaf)) { throw "Missing V8 notice: $($notice.file)" }
        $v8NoticeHash = (Get-FileHash -LiteralPath $v8NoticePath -Algorithm SHA256).Hash.ToLower()
        if ($v8NoticeHash -ne $notice.sha256) { throw "V8 notice hash mismatch: $($notice.file)" }
    }
    $v8LibraryPath = Join-Path $v8SdkRoot $v8SdkManifest.library.file
    if (-not (Test-Path -LiteralPath $v8LibraryPath -PathType Leaf)) { throw 'Missing pinned V8 static library.' }
    $v8LibraryHash = (Get-FileHash -LiteralPath $v8LibraryPath -Algorithm SHA256).Hash.ToLower()
    if ($v8LibraryHash -ne $v8SdkManifest.library.sha256) { throw 'V8 static library hash differs from its pinned SDK manifest.' }
    if ($v8SdkManifest.library.file -eq 'v8-host.lib') {
        if ($v8SdkManifest.library.upstreamFile -ne 'rusty_v8.lib' -or $v8SdkManifest.build.platformBridge.executableBytesUnmodified -ne $true) { throw 'Derived V8 static library lacks its original-byte provenance.' }
        $v8UpstreamLibraryPath = Join-Path $v8SdkRoot $v8SdkManifest.library.upstreamFile
        $v8UpstreamLibraryHash = (Get-FileHash -LiteralPath $v8UpstreamLibraryPath -Algorithm SHA256).Hash.ToLower()
        if ($v8UpstreamLibraryHash -ne $v8SdkManifest.library.upstreamSha256) { throw 'Original V8 static library hash differs from its pinned SDK manifest.' }
    }
    Copy-OwnedTree $v8LicenseRoot (Join-Path $noticeDirectory 'v8')
    Copy-Item -LiteralPath $v8SdkManifestPath -Destination (Join-Path $noticeDirectory 'v8-sdk-manifest.json')
    $runtimes += @{ id = 'v8'; version = $v8SdkManifest.version; jit = $true; linkage = 'static';
        wrapper = $v8SdkManifest.wrapper; headers = $v8SdkManifest.headers; build = $v8SdkManifest.build; library = $v8SdkManifest.library; librarySha256 = $v8LibraryHash;
        sdkManifestSha256 = (Get-FileHash -LiteralPath $v8SdkManifestPath -Algorithm SHA256).Hash.ToLower() }
    $defaultBackend = 'v8'
}

$launcher = @'
@echo off
cd /d "%~dp0"
ts-stg.exe __ENTRY__ --root "%~dp0." %*
'@
$launcherName = 'Run.cmd'
$launcher.Replace('__ENTRY__', $entry) | Set-Content -LiteralPath (Join-Path $staging $launcherName) -Encoding ascii
$runScript = @'
[CmdletBinding(PositionalBinding = $false)]
param([string]$Entry = '__ENTRY__', [Parameter(ValueFromRemainingArguments = $true)][string[]]$EngineArgs)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'ts-stg.exe') $Entry --root $PSScriptRoot @EngineArgs
if ($LASTEXITCODE -ne 0) { throw "TS-STG exited with code $LASTEXITCODE" }
'@
$runScript.Replace('__ENTRY__', $entry) | Set-Content -LiteralPath (Join-Path $staging 'run.ps1') -Encoding utf8
$resourceNotice = 'ENGINE SDK: contains only the native engine, portable thlib, common assets, API documentation and licenses. No demo games or title-specific resources are included; shared visual packs retain their own notices. Add your own main.js or pass an explicit application entry and project root.'
$launchInstructions = 'Create main.js in this directory, then run Run.cmd; or use ts-stg.exe main.js --root C:\Path\To\YourGame with thlib installed in that project.'
@"
TS-STG 0.1.0 - Windows x64

$launchInstructions
Node.js is not needed by the native runtime.
Default JavaScript backend: $defaultBackend. Use --backend quickjs or --backend v8 when that backend was compiled in.
Entry: $entry
Arrow keys: move/select; Z: shoot/confirm; X: bomb/back; Shift: focus; C: special; Esc: pause.

$resourceNotice

TypeScript source: packages/thlib/src/. Compiled library: packages/thlib/dist/. Common assets: packages/thlib/assets/.
Source repository build tools and verification fixtures are not release payload.
Read docs/native-api.md for the platform boundary. Saves go to userdata/.
The compiler's Microsoft Visual C++ x64 runtime may be required on another machine.

Repackaging creates a fresh output. Previous outputs are preserved beside it as
.$packageName.previous.<unique-id>, including any saves and user changes.
"@ | Set-Content -LiteralPath (Join-Path $staging 'START.txt') -Encoding utf8
$metadata = @{ format = 'ts-stg-local-package-v2'; version = '0.1.0'; entry = $entry;
    kind = 'engine-sdk';
    referenceAssets = $false; configuration = $Configuration;
    defaultBackend = $defaultBackend; runtimes = @($runtimes);
    createdUtc = [DateTime]::UtcNow.ToString('o'); binarySha256 = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLower();
    commonResourceCounts = $commonManifest.counts } |
    ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $staging 'PACKAGE.json'), $metadata, [Text.UTF8Encoding]::new($false))

Assert-DistributionPath $staging
Assert-DistributionPath $destination
if (Test-Path -LiteralPath $destination) {
    $previous = Join-Path $distributionRoot ('.' + $packageName + '.previous.' + [Guid]::NewGuid().ToString('N'))
    Assert-DistributionPath $previous
    Move-Item -LiteralPath $destination -Destination $previous
    Write-Output "Previous package preserved: $previous"
}
Move-Item -LiteralPath $staging -Destination $destination
Write-Output "Packaged: $destination/$launcherName"
