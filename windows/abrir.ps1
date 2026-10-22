# Abre o Jarvis: liga o servidor escondido e abre a janela dele no Microsoft Edge.
# O atalho "Jarvis" chama este arquivo; o atalho da Inicializacao passa -Inicio (roda a rotina.txt).
param([switch]$Inicio)
$pasta = Split-Path $PSScriptRoot -Parent
Set-Location $pasta

# Fecha um servidor do Jarvis que tenha ficado aberto, para o novo assumir a porta.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.js' -and $_.CommandLine -match 'env-file' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

Start-Process node -ArgumentList '--env-file-if-exists=.env', 'server.js' -WorkingDirectory $pasta -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $pasta 'jarvis.log') -RedirectStandardError (Join-Path $pasta 'jarvis-erros.log')

# Espera o servidor responder (no maximo uns 10 segundos).
for ($i = 0; $i -lt 40; $i++) {
  try { Invoke-WebRequest 'http://127.0.0.1:3000/api/config' -UseBasicParsing -TimeoutSec 1 | Out-Null; break }
  catch { Start-Sleep -Milliseconds 250 }
}

$endereco = 'http://127.0.0.1:3000/?auto'
if ($Inicio) { $endereco += '&rotina' }

# Perfil separado do Edge: deixa o Jarvis falar sem clique e lembra a permissao do microfone.
# Abre em tela cheia (F11 sai). As opcoes "background" deixam ele ouvindo mesmo minimizado.
$perfil = Join-Path $env:LOCALAPPDATA 'JarvisEdge'
Start-Process msedge -ArgumentList @(
  "--app=`"$endereco`"",
  "--user-data-dir=`"$perfil`"",
  '--autoplay-policy=no-user-gesture-required',
  '--start-fullscreen',
  '--no-first-run',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows'
)
