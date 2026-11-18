$ErrorActionPreference = 'Stop'
$root = (Split-Path $PSScriptRoot -Parent).Replace('\', '/').ToLowerInvariant()
$servers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $command = ([string]$_.CommandLine).Replace('\', '/').ToLowerInvariant()
    $command.Contains("$root/node_modules/") -and $command.Contains('/vite/bin/vite.js')
})
if ($servers.Count) {
    Write-Host 'BLOCKED: a DiagramAI Vite dev/preview server is using native dependencies.'
    Write-Host "Close that server before npm ci. Process IDs: $($servers.ProcessId -join ', ')"
    Write-Host 'The build does not kill processes automatically.'
    exit 1
}
Write-Host 'No DiagramAI Vite server holding native dependencies detected.'
