# Instalador do Ultron para Windows. É chamado pelo instalar.bat.
$ErrorActionPreference = "Stop"
$pasta = Split-Path $PSScriptRoot -Parent
Set-Location $pasta

function Sair($codigo) {
  Read-Host "`nAperte Enter para fechar"
  exit $codigo
}

Write-Host "`n=== Instalador do Ultron ===`n" -ForegroundColor Cyan

# 1. Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
$versao = if ($node) { [int]((node -v) -replace '^v(\d+).*', '$1') } else { 0 }
if ($versao -lt 22) {
  Write-Host "O Ultron precisa do Node.js (versão 22 ou mais nova), que é grátis." -ForegroundColor Yellow
  Write-Host "Vou abrir a página de download. Baixe a versão LTS, instale (é só ir clicando em Próximo)"
  Write-Host "e depois rode este instalador de novo."
  Start-Process "https://nodejs.org/pt/download"
  Sair 1
}

# Fecha um Ultron que esteja rodando, para a versão nova assumir.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.js' -and $_.CommandLine -match 'env-file' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# 2. Dependências
Write-Host "Instalando as peças do Ultron (pode levar um minuto)..."
npm install --omit=dev --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
  Write-Host "Não consegui instalar. Confira sua internet e tente de novo." -ForegroundColor Red
  Sair 1
}

# 3. Chave do cérebro (Gemini, grátis)
$arquivoEnv = Join-Path $pasta ".env"
$linhas = @()
if (Test-Path $arquivoEnv) { $linhas = [IO.File]::ReadAllLines($arquivoEnv) }
if (-not ($linhas | Where-Object { $_ -match '^(GEMINI|ANTHROPIC)_API_KEY=\S+' })) {
  Write-Host "`nPara pensar e conversar, o Ultron usa o Gemini do Google, que tem plano grátis." -ForegroundColor Cyan
  Write-Host "Vou abrir a página da chave. Entre com sua conta Google, clique em 'Create API key'"
  Write-Host "(ou 'Criar chave de API') e copie a chave que aparecer."
  Start-Process "https://aistudio.google.com/apikey"
  $chave = (Read-Host "`nCole a chave aqui (botão direito do mouse cola) e aperte Enter").Trim()
  if ($chave) {
    if (-not $linhas.Count) { $linhas = [IO.File]::ReadAllLines((Join-Path $pasta ".env.example")) }
    if ($linhas -match '^GEMINI_API_KEY=') {
      $linhas = [string[]]($linhas | ForEach-Object { if ($_ -match '^GEMINI_API_KEY=') { "GEMINI_API_KEY=$chave" } else { $_ } })
    } else {
      $linhas = [string[]]($linhas + "GEMINI_API_KEY=$chave")
    }
    [IO.File]::WriteAllLines($arquivoEnv, $linhas)
    Write-Host "Chave salva." -ForegroundColor Green
  } else {
    Write-Host "Sem chave, o Ultron abre mas não consegue responder. Rode o instalador de novo quando tiver a chave." -ForegroundColor Yellow
  }
}

# 4. Atalhos
$abrir = Join-Path $pasta "Ultron.vbs"
$wsh = New-Object -ComObject WScript.Shell
function Atalho($destino) {
  $lnk = $wsh.CreateShortcut($destino)
  $lnk.TargetPath = "$env:SystemRoot\System32\wscript.exe"
  $lnk.Arguments = '"' + $abrir + '"'
  $lnk.WorkingDirectory = $pasta
  $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,43"
  $lnk.Save()
}
Atalho (Join-Path ([Environment]::GetFolderPath("Desktop")) "Ultron.lnk")
Write-Host "`nCriei um atalho 'Ultron' na sua Área de Trabalho." -ForegroundColor Green

$resposta = Read-Host "`nQuer que o Ultron abra sozinho toda vez que você ligar o computador? (S/N)"
$inicio = Join-Path ([Environment]::GetFolderPath("Startup")) "Ultron.lnk"
if ($resposta -match '^[sS]') {
  Atalho $inicio
  Write-Host "Feito. Para desligar isso depois, rode o instalador de novo e responda N." -ForegroundColor Green
} elseif (Test-Path $inicio) {
  Remove-Item $inicio
  Write-Host "Início automático desligado."
}

Write-Host "`nTudo pronto! Abrindo o Ultron..." -ForegroundColor Cyan
Write-Host "Na primeira vez, o Edge vai pedir para usar o microfone: clique em Permitir."
Start-Process "$env:SystemRoot\System32\wscript.exe" -ArgumentList ('"' + $abrir + '"')
Sair 0
