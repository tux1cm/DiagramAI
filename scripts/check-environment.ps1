$ErrorActionPreference = 'Stop'
$missing = @()
foreach ($name in @('node', 'npm', 'git', 'rustc', 'cargo')) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { Write-Host "OK $name : $($cmd.Source)" }
    else { $missing += $name; Write-Host "MISSING $name" }
}
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msvc = if (Test-Path $vswhere) { & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath }
if ($msvc) { Write-Host "OK MSVC: $msvc" } else { $missing += 'MSVC C++ Build Tools'; Write-Host 'MISSING MSVC C++ Build Tools with Windows SDK' }
$edgePaths = @("${env:ProgramFiles(x86)}\Microsoft\EdgeWebView\Application", "$env:ProgramFiles\Microsoft\EdgeWebView\Application", "$env:LOCALAPPDATA\Microsoft\EdgeWebView\Application")
if ($edgePaths | Where-Object { Test-Path $_ }) { Write-Host 'OK WebView2 installation folder found (runtime launch not verified)' }
else { Write-Host 'WARNING WebView2 not detected in standard paths; verify runtime before desktop test.' }
if ($missing.Count) {
    Write-Host "BLOCKED: $($missing -join ', ')"
    Write-Host 'Install Rust stable MSVC from https://rustup.rs/ and Visual Studio Build Tools: Desktop development with C++ + Windows SDK. Reopen terminal.'
    exit 1
}
Write-Host 'Toolchain precheck OK. This is not proof of a successful EXE build.'
