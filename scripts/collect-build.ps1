$ErrorActionPreference = 'Stop'
$installer = @(Get-ChildItem 'apps/desktop/src-tauri/target/release/bundle/nsis/*.exe' -ErrorAction Stop)
if ($installer.Count -ne 1) { throw 'Expected exactly one NSIS installer. Inspect build output before collecting.' }
if (!(Test-Path 'apps/web/dist/index.html')) { throw 'Web build missing' }
# Preserve previous output in full, including any additional user files. Never delete it.
$previous = Join-Path 'File/Previous' (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
foreach ($name in @('Desktop_Light', 'Web')) {
    $output = Join-Path 'File' $name
    if (Test-Path $output) {
        New-Item -ItemType Directory -Force -Path $previous | Out-Null
        Move-Item $output (Join-Path $previous $name)
        Write-Host "Archived previous $name to $previous"
    }
}
New-Item -ItemType Directory -Force -Path 'File/Desktop_Light', 'File/Web' | Out-Null
Copy-Item $installer[0].FullName 'File/Desktop_Light/DiagramAI_Setup_x64.exe'
Copy-Item 'apps/web/dist/*' 'File/Web' -Recurse
$exe = Get-Item 'File/Desktop_Light/DiagramAI_Setup_x64.exe'
@{
    version = '0.0.0'
    phase = 'P1 React UI - not v1.0'
    builtAt = [DateTime]::UtcNow.ToString('o')
    installer = $exe.Name
    bytes = $exe.Length
    sha256 = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json | Set-Content 'File/Desktop_Light/release-manifest.json' -Encoding UTF8
@'
DiagramAI P1 React UI - NOT a production editor.
Run DiagramAI_Setup_x64.exe to install for the current Windows user.
Requires WebView2. This light installer downloads the bootstrapper only if needed.
Fixture selection/color changes are in-memory only. Do not use this build to save real work.
Cloud sync, AI, and production local persistence are NOT implemented.
Uninstall using Windows Settings > Apps > Installed apps > DiagramAI.
'@ | Set-Content 'File/Desktop_Light/README_Install.txt' -Encoding UTF8
Write-Host 'Copied P1 UI artifacts. These are not v1.0 release artifacts.'
