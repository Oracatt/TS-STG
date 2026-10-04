param(
    [ValidateSet('Debug','Release','RelWithDebInfo')][string]$Configuration = 'Release',
    [string]$Generator = '',
    [switch]$QuickJSOnly,
    [string]$V8Sdk = '',
    [switch]$Test,
    [switch]$Run
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Push-Location $projectRoot
try {
    if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) { throw 'CMake is required. Install CMake and a C/C++ compiler, then add CMake to PATH.' }
    $configureArgs = @('-S', '.', '-B', 'build', "-DCMAKE_BUILD_TYPE=$Configuration")
    $configureArgs += "-DTSSTG_ENABLE_V8=$(if ($QuickJSOnly) { 'OFF' } else { 'ON' })"
    if ($V8Sdk) { $configureArgs += "-DTSSTG_V8_SDK=$([IO.Path]::GetFullPath($V8Sdk))" }
    if ($Generator) { $configureArgs += @('-G', $Generator); if ($Generator -like 'Visual Studio*') { $configureArgs += @('-A', 'x64') } }
    elseif (-not (Test-Path 'build/CMakeCache.txt')) {
        $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
        if (Test-Path $vswhere) {
            $vsVersion = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property catalog_productLineVersion
            if ($vsVersion -eq '2022') { $configureArgs += @('-G', 'Visual Studio 17 2022', '-A', 'x64') }
            elseif ($vsVersion -eq '2019') { $configureArgs += @('-G', 'Visual Studio 16 2019', '-A', 'x64') }
        }
    }
    & cmake @configureArgs
    if ($LASTEXITCODE -ne 0) { throw 'CMake configure failed.' }
    & cmake --build build --config $Configuration --parallel 4
    if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
    if ($Test) {
        & ctest --test-dir build -C $Configuration --output-on-failure
        if ($LASTEXITCODE -ne 0) { throw 'Native tests failed.' }
        & node --test tests/*.test.js
        if ($LASTEXITCODE -ne 0) { throw 'thlib tests failed.' }
        & node tools/verify-integration.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Integration tests failed.' }
    }
    if ($Run) { & "$PSScriptRoot/run.ps1" -Configuration $Configuration }
} finally { Pop-Location }
