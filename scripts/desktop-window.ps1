param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [ValidateSet('inspect', 'resize', 'minimize', 'restore', 'close')][string]$Action = 'inspect',
    [int]$Width = 1366,
    [int]$Height = 768
)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DiagramWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hgt, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
}
'@
$null = [DiagramWindow]::SetThreadDpiAwarenessContext([IntPtr](-4))
$app = Get-Process -Id $ProcessId
if ($app.ProcessName -ne 'diagramai') { throw 'Only a DiagramAI test process may be controlled.' }
$handle = $app.MainWindowHandle
if ($handle -eq 0) { throw 'No app window yet' }
switch ($Action) {
    'minimize' { $null = [DiagramWindow]::ShowWindow($handle, 6) }
    'restore' { $null = [DiagramWindow]::ShowWindow($handle, 9) }
    'close' { $null = [DiagramWindow]::PostMessage($handle, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) }
    'resize' {
        $null = [DiagramWindow]::ShowWindow($handle, 9)
        $client = New-Object DiagramWindow+RECT
        $window = New-Object DiagramWindow+RECT
        $null = [DiagramWindow]::GetClientRect($handle, [ref]$client)
        $null = [DiagramWindow]::GetWindowRect($handle, [ref]$window)
        $outerWidth = $Width + ($window.Right - $window.Left) - ($client.Right - $client.Left)
        $outerHeight = $Height + ($window.Bottom - $window.Top) - ($client.Bottom - $client.Top)
        $null = [DiagramWindow]::SetWindowPos($handle, [IntPtr]::Zero, 0, 0, $outerWidth, $outerHeight, 0x16)
    }
}
$current = New-Object DiagramWindow+RECT
$null = [DiagramWindow]::GetClientRect($handle, [ref]$current)
@{ title = $app.MainWindowTitle; minimized = [DiagramWindow]::IsIconic($handle); width = $current.Right - $current.Left; height = $current.Bottom - $current.Top } | ConvertTo-Json -Compress
