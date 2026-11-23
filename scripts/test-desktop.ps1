param([ValidateSet('p5', 'managed', 'full')][string]$Scope = 'p5')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$setup = Join-Path $root 'File/Desktop_Light/DiagramAI_Setup_x64.exe'
if (!(Test-Path $setup)) { throw 'Build and collect the Windows UI installer first.' }
if ($Scope -eq 'p5') {
    $manifest = Get-Content 'File/Desktop_Light/release-manifest.json' -Raw | ConvertFrom-Json
    if ($manifest.phase -notlike 'P5*' -or !$manifest.testBuild) { throw 'P5 focused native suite needs a P5 test build (DIAGRAMAI_TEST_BUILD=1, VITE_API_BASE_URL=http://127.0.0.1:8787).' }
}
if ($Scope -eq 'managed') {
    $manifest = Get-Content 'File/Desktop_Light/release-manifest.json' -Raw | ConvertFrom-Json
    if ($manifest.phase -notlike 'P5*' -or $manifest.testBuild) { throw 'Managed verification requires the final P5 production build, not a fixture build.' }
}
# Never replace an existing user installation, even if it has the same version.
foreach ($hive in @('HKCU:', 'HKLM:')) {
    if (Test-Path "$hive\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiagramAI") {
        throw 'DiagramAI is already installed. Refusing to replace or uninstall user software.'
    }
}
$install = Join-Path "$env:LOCALAPPDATA\Temp\opencode" ('diagramai-install-test-' + [Guid]::NewGuid().ToString('N'))
$created = $false
$result = 1
$uninstallExit = $null
try {
    # /NS disables shortcuts. /D must be the final argument, without quotes (NSIS syntax).
    $process = Start-Process -FilePath $setup -ArgumentList "/S /NS /D=$install" -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    $created = $true
    $exe = Join-Path $install 'diagramai.exe'
    if (!(Test-Path $exe)) { throw 'Installed executable not found' }
    $env:DIAGRAMAI_TEST_EXE = $exe
    $config = if ($Scope -eq 'full') { 'playwright.desktop.config.ts' } elseif ($Scope -eq 'managed') { 'playwright.desktop-managed-p5.config.ts' } else { 'playwright.desktop-p5.config.ts' }
    & npx.cmd playwright test --config $config
    $result = $LASTEXITCODE
} finally {
    if ($created -and (Test-Path (Join-Path $install 'uninstall.exe'))) {
        # _?= prevents the NSIS uninstaller from self-copying/returning before completion.
        $uninstaller = Start-Process -FilePath (Join-Path $install 'uninstall.exe') -ArgumentList "/S _?=$install" -PassThru -Wait
        $uninstallExit = $uninstaller.ExitCode
        if ($uninstallExit -ne 0 -or (Test-Path (Join-Path $install 'diagramai.exe'))) { $result = 1 }
        if (Test-Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DiagramAI') { $result = 1 }
    } else { $result = 1 }
    Remove-Item Env:DIAGRAMAI_TEST_EXE -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force 'test-results' | Out-Null
    @{ installerExit = if ($created) { 0 } else { $null }; uninstallExit = $uninstallExit; testExit = $result; isolatedInstall = $install } | ConvertTo-Json | Set-Content 'test-results/desktop-installer.json' -Encoding UTF8
}
exit $result
