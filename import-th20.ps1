param([string]$Reference='D:\AIWorkspace\Touhou20Reconstruction')
$ErrorActionPreference='Stop'
$referencePath=(Resolve-Path -LiteralPath $Reference).Path
if (-not (Test-Path -LiteralPath (Join-Path $referencePath 'assets/raw/pl00.anm'))) { throw 'Reference directory does not contain extracted TH20 resources.' }
Push-Location $PSScriptRoot
try {
    & node tools/import-th20-assets.mjs --reference $referencePath
    if ($LASTEXITCODE -ne 0) { throw 'Original animation import failed.' }
    & node tools/import-th20-shots.mjs $referencePath
    if ($LASTEXITCODE -ne 0) { throw 'Original shooter import failed.' }
    & python tools/import-th20-bullet-styles.py --reference $referencePath
    if ($LASTEXITCODE -ne 0) { throw 'Original bullet style import failed.' }
    & node tools/import-th20-media.mjs $referencePath
    if ($LASTEXITCODE -ne 0) { throw 'Original sound import failed.' }
    & node tools/import-common-reference-assets.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Shared bullet/bomb visual asset extraction failed.' }
    & node tools/import-touhou-common-assets.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Complete shared player/animation/audio extraction failed.' }
} finally { Pop-Location }
