# Abre o Jarvis: liga o servidor escondido e abre a janela dele no Microsoft Edge.
# O atalho "Jarvis" chama este arquivo; o atalho da Inicializacao passa -Inicio (roda a rotina.txt).
param([switch]$Inicio)
$pasta = Split-Path $PSScriptRoot -Parent
Set-Location $pasta

# Fecha um servidor do Jarvis que tenha ficado aberto, para o novo assumir a porta.
# (So os do Jarvis: os marcados com --jarvis, ou com env-file nas versoes antigas.)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.js' -and $_.CommandLine -match 'env-file|--jarvis' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500

# Usa os certificados do Windows: antivirus que vigiam HTTPS (Kaspersky, Avast, ESET...) trocam o
# certificado dos sites, e sem isso o Node recusa a conexao (voz, cerebro e Spotify falham).
$opcoesNode = @()
& node --use-system-ca -e 0 2>$null
if ($LASTEXITCODE -eq 0) { $opcoesNode += '--use-system-ca' }

# Se o Windows usa proxy (alguns programas e redes configuram um), o Jarvis usa o mesmo.
$net = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
if ($net -and $net.ProxyEnable -eq 1 -and $net.ProxyServer) {
  $proxy = $net.ProxyServer
  if ($proxy -match 'https=([^;]+)') { $proxy = $Matches[1] } elseif ($proxy -match 'http=([^;]+)') { $proxy = $Matches[1] }
  if ($proxy -notmatch '^\w+://') { $proxy = "http://$proxy" }
  $env:HTTPS_PROXY = $proxy
  $env:HTTP_PROXY = $proxy
  $env:NO_PROXY = 'localhost,127.0.0.1'
  $env:NODE_USE_ENV_PROXY = '1'
}

# Atualiza sozinho se tiver versao nova no GitHub (no maximo 2 minutos; sem internet, segue).
$atualizar = Start-Process node -ArgumentList ($opcoesNode + 'atualizar.js') -WorkingDirectory $pasta -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $pasta 'atualizacao.log') -RedirectStandardError (Join-Path $pasta 'atualizacao-erros.log')
if (-not $atualizar.WaitForExit(120000)) { Stop-Process -Id $atualizar.Id -Force -ErrorAction SilentlyContinue }

Start-Process node -ArgumentList ($opcoesNode + 'server.js', '--jarvis') -WorkingDirectory $pasta -WindowStyle Hidden `
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
