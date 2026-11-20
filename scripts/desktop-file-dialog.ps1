param(
    [Parameter(Mandatory = $true)][int]$ProcessId,
    [Parameter(Mandatory = $true)][string]$TestDirectory,
    [Parameter(Mandatory = $true)][string]$FileName
)
$ErrorActionPreference = 'Stop'
if ((Get-Process -Id $ProcessId).ProcessName -ne 'diagramai') { throw 'Only a DiagramAI test process may be controlled.' }
$root = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Temp/opencode')) + [IO.Path]::DirectorySeparatorChar
$directory = [IO.Path]::GetFullPath($TestDirectory)
if (!$directory.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or !(Test-Path $directory)) { throw 'File dialogs must target an existing isolated test directory.' }
if ([IO.Path]::GetFileName($FileName) -ne $FileName) { throw 'Expected a simple file name.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$condition = New-Object System.Windows.Automation.AndCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcessId)),
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770'))
)
$timer = [Diagnostics.Stopwatch]::StartNew()
$dialog = $null
while (!$dialog -and $timer.Elapsed.TotalSeconds -lt 20) {
    $dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
    if (!$dialog) { Start-Sleep -Milliseconds 100 }
}
if (!$dialog) { throw 'No native file dialog appeared.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class DiagramFileDialog {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc callback, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder value, int count);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
  [DllImport("user32.dll", EntryPoint="SendMessageW", CharSet=CharSet.Unicode)] public static extern IntPtr ReadText(IntPtr h, uint message, IntPtr count, System.Text.StringBuilder value);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static IntPtr FilenameEdit(IntPtr root) {
    IntPtr found=IntPtr.Zero;
    EnumChildWindows(root,(h,l)=>{var name=new System.Text.StringBuilder(256);GetClassName(h,name,256);var id=GetDlgCtrlID(h);if(name.ToString().Contains("Edit")&&(id==1001||id==1148)){found=h;return false;}return true;},IntPtr.Zero);
    return found;
  }
  public static string EditControls(IntPtr root) {
    var result=new System.Text.StringBuilder();
    EnumChildWindows(root,(h,l)=>{var name=new System.Text.StringBuilder(256);GetClassName(h,name,256);if(name.ToString().Contains("Edit")||name.ToString().Contains("Combo"))result.Append(name+" id="+GetDlgCtrlID(h)+"; ");return true;},IntPtr.Zero);
    return result.ToString();
  }
}
'@
$handle = [DiagramFileDialog]::FilenameEdit([IntPtr]$dialog.Current.NativeWindowHandle)
while ($handle -eq [IntPtr]::Zero -and $timer.Elapsed.TotalSeconds -lt 20) {
    Start-Sleep -Milliseconds 100
    $dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
    if ($dialog) { $handle = [DiagramFileDialog]::FilenameEdit([IntPtr]$dialog.Current.NativeWindowHandle) }
}
[uint32]$owner = 0
$null = [DiagramFileDialog]::GetWindowThreadProcessId($handle, [ref]$owner)
if ($handle -eq [IntPtr]::Zero -or $owner -ne $ProcessId) { throw "No owned file-name edit in dialog: $($dialog.Current.Name). $([DiagramFileDialog]::EditControls([IntPtr]$dialog.Current.NativeWindowHandle))" }
$dialogHandle = [IntPtr]$dialog.Current.NativeWindowHandle
$null = [DiagramFileDialog]::GetWindowThreadProcessId($dialogHandle, [ref]$owner)
if ($dialogHandle -eq [IntPtr]::Zero -or $owner -ne $ProcessId) { throw 'Dialog is not owned by the isolated test app.' }
# Send edit notifications to the real nested HWND, not its DirectUI wrapper.
# No global keyboard or OS clipboard: user focus and personal clipboard stay untouched.
$path = Join-Path $directory $FileName
$null = [DiagramFileDialog]::SendMessage($handle, 0x00B1, [IntPtr]::Zero, [IntPtr](-1))
$null = [DiagramFileDialog]::SendMessage($handle, 0x0303, [IntPtr]::Zero, [IntPtr]::Zero)
foreach ($character in $path.ToCharArray()) { $null = [DiagramFileDialog]::SendMessage($handle, 0x0102, [IntPtr]([int]$character), [IntPtr]::Zero) }
$text = New-Object System.Text.StringBuilder 2048
$null = [DiagramFileDialog]::ReadText($handle, 0x000D, [IntPtr]$text.Capacity, $text)
if ($text.ToString() -ne $path) { throw 'Refusing to confirm: file-name input does not match the isolated test path.' }
$null = [DiagramFileDialog]::PostMessage($dialogHandle, 0x0111, [IntPtr]1, [IntPtr]::Zero)
Write-Output 'Native file dialog confirmed in isolated test directory.'
