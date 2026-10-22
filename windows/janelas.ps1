# Janelas dos outros programas: listar, minimizar, maximizar, trazer para a frente, fechar,
# mover para outro monitor e escrever texto. Quem escolhe a janela e o tools.js (pelo nome);
# aqui so se age na janela (pelo numero dela, -Janela).
param(
  [ValidateSet('listar', 'minimizar', 'maximizar', 'restaurar', 'frente', 'fechar', 'monitor', 'escrever', 'minimizar_tudo')]
  [string]$Acao = 'listar',
  [long]$Janela = 0,
  [int]$Monitor = 1,
  [string]$Texto64 = ''
)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -Namespace Jarvis -Name Win -MemberDefinition @'
public delegate bool EnumProc(IntPtr h, IntPtr p);
[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr p);
[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
[DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
public struct RECT { public int Left, Top, Right, Bottom; }
'@
[Jarvis.Win]::SetProcessDPIAware() | Out-Null
$h = [IntPtr]$Janela

function Frente($h) {
  if ([Jarvis.Win]::IsIconic($h)) { [Jarvis.Win]::ShowWindow($h, 9) | Out-Null }
  # O Windows so deixa trocar a janela da frente logo depois de uma tecla: um Alt "solto" resolve.
  [Jarvis.Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [Jarvis.Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [Jarvis.Win]::SetForegroundWindow($h) | Out-Null
}

switch ($Acao) {
  'listar' {
    # Janelas visiveis com titulo, da que esta mais na frente para a de tras.
    $lista = New-Object System.Collections.ArrayList
    $cb = [Jarvis.Win+EnumProc] {
      param($w, $p)
      if (-not [Jarvis.Win]::IsWindowVisible($w)) { return $true }
      if ([Jarvis.Win]::GetWindow($w, 4) -ne [IntPtr]::Zero) { return $true } # janelas "filhas" (dialogos)
      if (([Jarvis.Win]::GetWindowLong($w, -20) -band 0x80) -ne 0) { return $true } # janelas de ferramenta
      $sb = New-Object System.Text.StringBuilder 256
      [Jarvis.Win]::GetWindowText($w, $sb, 256) | Out-Null
      $titulo = $sb.ToString()
      if (-not $titulo) { return $true }
      $id = 0
      [Jarvis.Win]::GetWindowThreadProcessId($w, [ref]$id) | Out-Null
      $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
      [void]$lista.Add([pscustomobject]@{ janela = [long]$w; pid = [int]$id; processo = "$($proc.ProcessName)"; titulo = $titulo; minimizada = [Jarvis.Win]::IsIconic($w) })
      return $true
    }
    [Jarvis.Win]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
    $telas = [System.Windows.Forms.Screen]::AllScreens.Count
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 3 @{ janelas = @($lista); monitores = $telas }))
  }
  'minimizar' { [Jarvis.Win]::ShowWindow($h, 6) | Out-Null }
  'maximizar' { Frente $h; [Jarvis.Win]::ShowWindow($h, 3) | Out-Null }
  'restaurar' { [Jarvis.Win]::ShowWindow($h, 9) | Out-Null; Frente $h }
  'frente' { Frente $h }
  'minimizar_tudo' { (New-Object -ComObject Shell.Application).MinimizeAll() }
  'fechar' {
    # Primeiro pede com educacao (como clicar no X). Se ele continuar aberto (por exemplo com uma
    # pergunta "deseja sair?"), encerra o programa. O Edge nunca e encerrado a forca: a janela do
    # Jarvis roda nele.
    $id = 0
    [Jarvis.Win]::GetWindowThreadProcessId($h, [ref]$id) | Out-Null
    $nome = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
    [Jarvis.Win]::PostMessage($h, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    for ($i = 0; $i -lt 12 -and [Jarvis.Win]::IsWindow($h) -and [Jarvis.Win]::IsWindowVisible($h); $i++) { Start-Sleep -Milliseconds 250 }
    if ([Jarvis.Win]::IsWindow($h) -and [Jarvis.Win]::IsWindowVisible($h)) {
      if ($nome -eq 'msedge' -or $id -eq 0) { [Console]::Out.WriteLine('PERGUNTOU'); break }
      & taskkill.exe /PID $id /T /F | Out-Null
      [Console]::Out.WriteLine('FORCADO')
    } else { [Console]::Out.WriteLine('FECHOU') }
  }
  'monitor' {
    # Monitor 1 e o principal; os outros seguem da esquerda para a direita.
    $telas = @([System.Windows.Forms.Screen]::AllScreens | Sort-Object { -not $_.Primary }, { $_.Bounds.X })
    if ($Monitor -lt 1 -or $Monitor -gt $telas.Count) { [Console]::Out.WriteLine("SEM $($telas.Count)"); break }
    $destino = $telas[$Monitor - 1].WorkingArea
    $estavaMax = [Jarvis.Win]::IsZoomed($h)
    if ($estavaMax -or [Jarvis.Win]::IsIconic($h)) { [Jarvis.Win]::ShowWindow($h, 9) | Out-Null }
    $r = New-Object Jarvis.Win+RECT
    [Jarvis.Win]::GetWindowRect($h, [ref]$r) | Out-Null
    $origem = [System.Windows.Forms.Screen]::FromHandle($h).WorkingArea
    $l = [Math]::Min($r.Right - $r.Left, $destino.Width)
    $a = [Math]::Min($r.Bottom - $r.Top, $destino.Height)
    # Mesma posicao relativa no monitor novo, sem sair da tela.
    $x = $destino.X + [Math]::Max(0, [Math]::Min($r.Left - $origem.X, $destino.Width - $l))
    $y = $destino.Y + [Math]::Max(0, [Math]::Min($r.Top - $origem.Y, $destino.Height - $a))
    [Jarvis.Win]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, $l, $a, 0x0004) | Out-Null
    if ($estavaMax) { [Jarvis.Win]::ShowWindow($h, 3) | Out-Null }
    Frente $h
    [Console]::Out.WriteLine("OK $($telas.Count)")
  }
  'escrever' {
    # Cola pelo Ctrl+V: assim acentos e qualquer letra saem certos. Depois devolve o que estava
    # copiado antes.
    $texto = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Texto64))
    $antes = $null
    try { if ([System.Windows.Forms.Clipboard]::ContainsText()) { $antes = [System.Windows.Forms.Clipboard]::GetText() } } catch {}
    if ($h -ne [IntPtr]::Zero) { Frente $h; Start-Sleep -Milliseconds 150 }
    [System.Windows.Forms.Clipboard]::SetText($texto)
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 300
    try { if ($antes) { [System.Windows.Forms.Clipboard]::SetText($antes) } else { [System.Windows.Forms.Clipboard]::Clear() } } catch {}
    [Console]::Out.WriteLine('OK')
  }
}
