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
    phase = 'P5 private workspace sync - not v1.0'
    testBuild = ($env:DIAGRAMAI_TEST_BUILD -eq '1')
    builtAt = [DateTime]::UtcNow.ToString('o')
    installer = $exe.Name
    bytes = $exe.Length
    sha256 = (Get-FileHash $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
} | ConvertTo-Json | Set-Content 'File/Desktop_Light/release-manifest.json' -Encoding UTF8
@'
DiagramAI P5 local and cloud sync - preview, not v1.0.
Run DiagramAI_Setup_x64.exe to install for the current Windows user.
Requires WebView2. This light installer downloads the bootstrapper only if needed.
Committed changes autosave locally in SQLite. Only "Da luu tren may" confirms a successful local write.
Export .diagramai backups before clearing app/browser data; external files are saved only on request.
Web and Desktop use one private workspace catalog: Projects > Drawings. Paste the same private main link once on each device; no separate device workspace is needed.
Back up the private workspace link; anyone holding it can access the whole workspace. No per-drawing pairing is needed.
Only an acknowledged server revision counts as synchronized.
Conflicts preserve local copies; AI is NOT implemented.
New links use 22-character Neon-backed aliases; old links still work. Only the owner workspace has confirmed cloud deletion actions; downloaded local backups are retained.
Uninstall using Windows Settings > Apps > Installed apps > DiagramAI.
'@ | Set-Content 'File/Desktop_Light/README_Install.txt' -Encoding UTF8
if ($env:DIAGRAMAI_TEST_BUILD -eq '1') {
    Add-Content 'File/Desktop_Light/README_Install.txt' 'TEST BUILD: uses an isolated test API; do not install for real work.' -Encoding UTF8
}
Write-Host 'Copied P5 sync artifacts. These are not v1.0 release artifacts; inspect testBuild in the manifest.'
