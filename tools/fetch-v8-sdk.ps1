[CmdletBinding()]
param([string]$Destination = (Join-Path $PSScriptRoot '../build/v8-sdk'), [string]$Librarian = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$sdkDirectory = [IO.Path]::GetFullPath($Destination)
$headerRevision = 'db2b8439ec4d3ae972330cc2e9830ccd517d7235'
$sourceName = "v8-$headerRevision"
New-Item -ItemType Directory -Path $sdkDirectory -Force | Out-Null

function Get-PinnedFile([string]$Name, [string]$Url, [string]$Sha256) {
    $target = Join-Path $sdkDirectory $Name
    if (-not (Test-Path -LiteralPath $target) -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $Sha256) {
        Write-Output "Downloading pinned V8 dependency: $Name"
        Invoke-WebRequest -Uri $Url -OutFile $target -TimeoutSec 180 -UseBasicParsing
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $Sha256) {
        throw "V8 dependency hash mismatch: $Name"
    }
}
Get-PinnedFile 'rusty_v8.lib.gz' 'https://github.com/denoland/rusty_v8/releases/download/v0.89.0/rusty_v8_release_x86_64-pc-windows-msvc.lib.gz' '19fb2f7cda3d6cd42179ec86c552d3efca639142f08b37fff18615ae6679ece2'
Get-PinnedFile 'v8-headers.tar.gz' "https://codeload.github.com/denoland/v8/tar.gz/$headerRevision" 'c0117ad65843deffb7363ef7feb6cd6198d4c0d965c85f135f41e7e0ffe504a8'
Get-PinnedFile 'rusty_v8-LICENSE' 'https://raw.githubusercontent.com/denoland/rusty_v8/v0.89.0/LICENSE' '1c6356fb751d45f0c53093ebf8a7f5e580e802f51999178e19d60f3ec39e147d'

$library = Join-Path $sdkDirectory 'rusty_v8.lib'
$libraryHash = 'e168995c158b95d13a33992ed23a8b7fa84687a46d0b079b4a1eab9a055b23c3'
if (-not (Test-Path -LiteralPath $library) -or (Get-FileHash -LiteralPath $library -Algorithm SHA256).Hash -ne $libraryHash) {
    $inputStream = [IO.File]::OpenRead((Join-Path $sdkDirectory 'rusty_v8.lib.gz'))
    $gzipStream = [IO.Compression.GZipStream]::new($inputStream, [IO.Compression.CompressionMode]::Decompress)
    $outputStream = [IO.File]::Create($library)
    try { $gzipStream.CopyTo($outputStream) }
    finally { $outputStream.Dispose(); $gzipStream.Dispose(); $inputStream.Dispose() }
}
if ((Get-FileHash -LiteralPath $library -Algorithm SHA256).Hash -ne $libraryHash) { throw 'Uncompressed V8 library hash mismatch.' }

# Upstream's monolithic Rust binding object also references unused Rust
# inspector/serializer delegates. Keep its two platform C-ABI functions and
# exact unwind sections, without changing their machine code or V8 itself.
if (-not $Librarian) {
    $librarianCommand = Get-Command lib.exe -ErrorAction SilentlyContinue
    if (-not $librarianCommand) { throw 'Pass -Librarian with the MSVC lib.exe path, or configure through CMake.' }
    $Librarian = $librarianCommand.Source
}
$nodeCommand = Get-Command node -ErrorAction Stop
$bindingOriginal = Join-Path $sdkDirectory 'binding-original.obj'
$bindingPlatform = Join-Path $sdkDirectory 'binding-platform.obj'
$platformReport = Join-Path $sdkDirectory 'platform-object.json'
$hostLibrary = Join-Path $sdkDirectory 'v8-host.lib'
& $Librarian /NOLOGO /EXTRACT:rusty_v8/binding.obj "/OUT:$bindingOriginal" $library
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract the V8 platform bridge object.' }
if ((Get-FileHash -LiteralPath $bindingOriginal -Algorithm SHA256).Hash -ne 'af8a48f4317731d16963b4a244e20f78a350627d1cf545ee12844157ae2fbea2') {
    throw 'Original V8 bridge object hash mismatch.'
}
& $nodeCommand.Source (Join-Path $PSScriptRoot 'prepare-v8-platform-object.cjs') $bindingOriginal $bindingPlatform $platformReport
if ($LASTEXITCODE -ne 0) { throw 'Cannot isolate the original V8 platform C-ABI bridge.' }
if ((Get-FileHash -LiteralPath $bindingPlatform -Algorithm SHA256).Hash -ne '7733761c7fdac0746a6692cfe3b4e145271b21f1942b510bbb3924d5c4b37bf6') {
    throw 'Derived V8 platform bridge hash mismatch.'
}
& $Librarian /NOLOGO /REMOVE:rusty_v8/binding.obj "/OUT:$hostLibrary" $library $bindingPlatform
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare the V8 host static library.' }
$platformProvenance = Get-Content -LiteralPath $platformReport -Raw | ConvertFrom-Json

# Extract only public headers and license notices; no generated game source.
$licensePaths = @('src/third_party/siphash/LICENSE','src/third_party/utf8-decoder/LICENSE',
    'src/third_party/valgrind/LICENSE','src/third_party/vtune/LICENSE',
    'third_party/colorama/LICENSE','third_party/fp16/LICENSE','third_party/glibc/LICENSE',
    'third_party/inspector_protocol/LICENSE','third_party/jsoncpp/LICENSE','third_party/re2/LICENSE',
    'third_party/test262-harness/LICENSE','third_party/v8/builtins/LICENSE','third_party/wasm-api/LICENSE')
$archiveEntries = @("$sourceName/include", "$sourceName/LICENSE") + @($licensePaths | ForEach-Object { "$sourceName/$_" })
& tar -xzf (Join-Path $sdkDirectory 'v8-headers.tar.gz') -C $sdkDirectory @archiveEntries
if ($LASTEXITCODE -ne 0) { throw 'Cannot extract the pinned V8 headers.' }
Copy-Item -LiteralPath (Join-Path $sdkDirectory "$sourceName/include") -Destination $sdkDirectory -Recurse -Force
$noticeDirectory = Join-Path $sdkDirectory 'licenses'
New-Item -ItemType Directory -Path $noticeDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sdkDirectory "$sourceName/LICENSE") -Destination (Join-Path $noticeDirectory 'V8-LICENSE') -Force
Copy-Item -LiteralPath (Join-Path $sdkDirectory 'rusty_v8-LICENSE') -Destination $noticeDirectory -Force
foreach ($licensePath in $licensePaths) {
    $noticeName = 'V8-' + ($licensePath -replace '/', '-')
    Copy-Item -LiteralPath (Join-Path $sdkDirectory "$sourceName/$licensePath") -Destination (Join-Path $noticeDirectory $noticeName) -Force
}
$licenseEntries = @(Get-ChildItem -LiteralPath $noticeDirectory -File | Sort-Object Name | ForEach-Object {
    @{file=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
})
$manifest = @{format='ts-stg-v8-sdk-v1';version='12.3.219.9';wrapper=@{name='rusty_v8';version='0.89.0'};
    library=@{file='v8-host.lib';sha256=(Get-FileHash -LiteralPath $hostLibrary -Algorithm SHA256).Hash.ToLowerInvariant();
        upstreamFile='rusty_v8.lib';upstreamSha256=$libraryHash;archiveSha256='19fb2f7cda3d6cd42179ec86c552d3efca639142f08b37fff18615ae6679ece2'};
    headers=@{revision=$headerRevision;archiveSha256='c0117ad65843deffb7363ef7feb6cd6198d4c0d965c85f135f41e7e0ffe504a8'};
    build=@{platform='windows-x64';linkage='static';pointerCompression=$false;sandbox=$false;externalStartupData=$false;promiseInternalFieldCount=1;
        crt='static';platformBridge=$platformProvenance};licenses=$licenseEntries}
[IO.File]::WriteAllText((Join-Path $sdkDirectory 'manifest.json'), ($manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
Write-Output "V8 12.3.219.9 SDK ready: $sdkDirectory"
