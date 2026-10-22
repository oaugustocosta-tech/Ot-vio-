# Instalador do Jarvis para Windows. É chamado pelo instalar.bat.
$ErrorActionPreference = "Stop"
$pasta = Split-Path $PSScriptRoot -Parent
Set-Location $pasta

function Sair($codigo) {
  Read-Host "`nAperte Enter para fechar"
  exit $codigo
}

Write-Host "`n=== Instalador do Jarvis ===`n" -ForegroundColor Cyan

# 1. Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
$versao = if ($node) { [int]((node -v) -replace '^v(\d+).*', '$1') } else { 0 }
if ($versao -lt 22) {
  Write-Host "O Jarvis precisa do Node.js (versão 22 ou mais nova), que é grátis." -ForegroundColor Yellow
  Write-Host "Vou abrir a página de download. Baixe a versão LTS, instale (é só ir clicando em Próximo)"
  Write-Host "e depois rode este instalador de novo."
  Start-Process "https://nodejs.org/pt/download"
  Sair 1
}

# Fecha um Jarvis que esteja rodando, para a versão nova assumir.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'server\.js' -and $_.CommandLine -match 'env-file' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

# 2. Dependências
Write-Host "Instalando as peças do Jarvis (pode levar um minuto)..."
npm install --omit=dev --no-fund --no-audit
if ($LASTEXITCODE -ne 0) {
  Write-Host "Não consegui instalar. Confira sua internet e tente de novo." -ForegroundColor Red
  Sair 1
}

# 3. Chaves
$arquivoEnv = Join-Path $pasta ".env"
$linhas = @()
if (Test-Path $arquivoEnv) { $linhas = [IO.File]::ReadAllLines($arquivoEnv) }
if (-not $linhas.Count) { $linhas = [IO.File]::ReadAllLines((Join-Path $pasta ".env.example")) }

function TemChave($nome) { [bool]($linhas | Where-Object { $_ -match "^$nome=\S+" }) }
function SalvarChave($nome, $valor) {
  if ($linhas -match "^$nome=") {
    $script:linhas = [string[]]($linhas | ForEach-Object { if ($_ -match "^$nome=") { "$nome=$valor" } else { $_ } })
  } else {
    $script:linhas = [string[]]($linhas + "$nome=$valor")
  }
  [IO.File]::WriteAllLines($arquivoEnv, $script:linhas)
}

# Cérebro: Groq, grátis e muito rápido.
if (-not (TemChave "GROQ_API_KEY") -and -not (TemChave "ANTHROPIC_API_KEY")) {
  Write-Host "`nPara pensar rápido, o Jarvis usa o Groq, que é grátis e responde em menos de um segundo." -ForegroundColor Cyan
  Write-Host "Vou abrir a página. Entre com sua conta Google, clique em 'Create API Key', dê um nome"
  Write-Host "qualquer (por exemplo, jarvis) e copie a chave que começa com gsk_."
  Start-Process "https://console.groq.com/keys"
  $chave = (Read-Host "`nCole a chave do Groq aqui (botão direito do mouse cola) e aperte Enter").Trim()
  if ($chave) {
    SalvarChave "GROQ_API_KEY" $chave
    Write-Host "Chave salva." -ForegroundColor Green
  } elseif (-not (TemChave "GEMINI_API_KEY")) {
    Write-Host "Sem chave, o Jarvis abre mas não consegue responder. Rode o instalador de novo quando tiver a chave." -ForegroundColor Yellow
  }
}

# Voz: ElevenLabs (opcional). O plano grátis dá uns 20 minutos de fala por mês; depois, ele
# passa sozinho para a voz grátis da Microsoft.
if (-not (TemChave "ELEVENLABS_API_KEY")) {
  $quer = Read-Host "`nQuer a voz mais realista (ElevenLabs, plano grátis com limite)? (S/N)"
  if ($quer -match '^[sS]') {
    Write-Host "Vou abrir a página. Crie a conta grátis, depois vá em 'API Keys', clique em 'Create API Key'"
    Write-Host "e copie a chave que começa com sk_."
    Start-Process "https://elevenlabs.io/app/settings/api-keys"
    $chave = (Read-Host "`nCole a chave da ElevenLabs aqui e aperte Enter").Trim()
    if ($chave) {
      SalvarChave "ELEVENLABS_API_KEY" $chave
      Write-Host "Chave salva." -ForegroundColor Green
    }
  }
}

# Qual voz da ElevenLabs usar (só pergunta se tiver a chave).
if (TemChave "ELEVENLABS_API_KEY") {
  Write-Host "`nVozes no estilo Jarvis (todas falam português):" -ForegroundColor Cyan
  Write-Host "  1. Daniel  - britânico, sério e elegante (padrão)"
  Write-Host "  2. George  - britânico, mais caloroso"
  Write-Host "  3. Brian   - americano, grave"
  Write-Host "  4. Alice   - britânica, firme (feminina)"
  Write-Host "  5. Lily    - britânica, suave (feminina)"
  $num = (Read-Host "Digite o número da voz, ou só Enter para manter a atual").Trim()
  $nomes = @{ "1" = "daniel"; "2" = "george"; "3" = "brian"; "4" = "alice"; "5" = "lily" }
  if ($nomes.ContainsKey($num)) {
    SalvarChave "JARVIS_VOZ" $nomes[$num]
    Write-Host "Voz escolhida: $($nomes[$num])." -ForegroundColor Green
  }
}

# 4. Atalhos (e remove os antigos, do tempo em que ele se chamava Ultron)
foreach ($antigo in @(
  (Join-Path ([Environment]::GetFolderPath("Desktop")) "Ultron.lnk"),
  (Join-Path ([Environment]::GetFolderPath("Startup")) "Ultron.lnk")
)) { if (Test-Path $antigo) { Remove-Item $antigo } }
$abrir = Join-Path $pasta "Jarvis.vbs"
$wsh = New-Object -ComObject WScript.Shell
function Atalho($destino, $extra = "") {
  $lnk = $wsh.CreateShortcut($destino)
  $lnk.TargetPath = "$env:SystemRoot\System32\wscript.exe"
  $lnk.Arguments = ('"' + $abrir + '" ' + $extra).Trim()
  $lnk.WorkingDirectory = $pasta
  $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,43"
  $lnk.Save()
}
Atalho (Join-Path ([Environment]::GetFolderPath("Desktop")) "Jarvis.lnk")
Write-Host "`nCriei um atalho 'Jarvis' na sua Área de Trabalho." -ForegroundColor Green

$resposta = Read-Host "`nQuer que o Jarvis abra sozinho toda vez que você ligar o computador? (S/N)"
$inicio = Join-Path ([Environment]::GetFolderPath("Startup")) "Jarvis.lnk"
if ($resposta -match '^[sS]') {
  Atalho $inicio "inicio"
  Write-Host "Feito. Ele abre em tela cheia e roda a rotina (o arquivo rotina.txt nesta pasta)." -ForegroundColor Green
  Write-Host "Para desligar isso depois, rode o instalador de novo e responda N." -ForegroundColor Green
} elseif (Test-Path $inicio) {
  Remove-Item $inicio
  Write-Host "Início automático desligado."
}

Write-Host "`nTudo pronto! Abrindo o Jarvis..." -ForegroundColor Cyan
Write-Host "Na primeira vez, o Edge vai pedir para usar o microfone: clique em Permitir."
Write-Host "Depois do bom-dia, é só dizer 'Jarvis' e o pedido. F11 sai da tela cheia; minimizado ele continua ouvindo."
Start-Process "$env:SystemRoot\System32\wscript.exe" -ArgumentList ('"' + $abrir + '"')
Sair 0
