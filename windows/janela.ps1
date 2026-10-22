# Mostra (restaura) ou esconde (minimiza) a janela do Jarvis, cujo titulo e "JARVIS".
param([ValidateSet('mostrar', 'esconder')][string]$Acao = 'mostrar')
Add-Type -Name Janela -Namespace Jarvis -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
'@
$modo = if ($Acao -eq 'mostrar') { 9 } else { 6 }  # 9 = restaurar, 6 = minimizar
Get-Process msedge -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'JARVIS*' } |
  ForEach-Object {
    [Jarvis.Janela]::ShowWindowAsync($_.MainWindowHandle, $modo) | Out-Null
    if ($Acao -eq 'mostrar') { [Jarvis.Janela]::SetForegroundWindow($_.MainWindowHandle) | Out-Null }
  }
