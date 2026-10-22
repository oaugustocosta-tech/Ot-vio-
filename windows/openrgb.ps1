# Baixa o OpenRGB (gratis, codigo aberto) para o Jarvis controlar o LED das fans.
# Nao desinstala nem desliga nada do Armoury Crate. Chamado pelo botao "Instalar OpenRGB" em Ajustes.
# Uso: openrgb.ps1 <pasta de dados do Jarvis>
param([string]$dados = "$env:APPDATA\Jarvis")
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Achar {
  $fixos = @("$env:ProgramFiles\OpenRGB\OpenRGB.exe", "${env:ProgramFiles(x86)}\OpenRGB\OpenRGB.exe")
  foreach ($f in $fixos) { if (Test-Path $f) { return $f } }
  $achou = Get-ChildItem -Path "$dados\OpenRGB" -Filter OpenRGB.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($achou) { return $achou.FullName }
  return $null
}

if (Achar) { [Console]::Out.WriteLine('OK O OpenRGB já está instalado'); exit 0 }
try {
  # Versao mais nova, do site oficial (Codeberg).
  $rel = Invoke-RestMethod -Uri 'https://codeberg.org/api/v1/repos/OpenRGB/OpenRGB/releases/latest' -TimeoutSec 30 -Headers @{ 'User-Agent' = 'Jarvis' }
  $assets = @($rel.assets | Where-Object { $_.name -match 'Windows' -and $_.name -match '64' -and $_.name -notmatch 'arm' })
  $zip = $assets | Where-Object { $_.name -match '\.zip$' } | Select-Object -First 1
  $inst = $assets | Where-Object { $_.name -match '\.(exe|msi)$' } | Select-Object -First 1
  if ($zip) {
    $tmp = Join-Path $env:TEMP $zip.name
    Invoke-WebRequest -Uri $zip.browser_download_url -OutFile $tmp -UseBasicParsing -TimeoutSec 300
    Expand-Archive -Path $tmp -DestinationPath "$dados\OpenRGB" -Force
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  } elseif ($inst) {
    # So tem instalador: abre ele para a pessoa ir clicando em Proximo.
    $tmp = Join-Path $env:TEMP $inst.name
    Invoke-WebRequest -Uri $inst.browser_download_url -OutFile $tmp -UseBasicParsing -TimeoutSec 300
    Start-Process -FilePath $tmp -Wait
  } else { throw 'não achei o arquivo para Windows' }
} catch {
  Start-Process 'https://openrgb.org/releases.html'
  [Console]::Out.WriteLine("ERRO Não consegui baixar o OpenRGB sozinho ($($_.Exception.Message)). Abri o site dele: baixe a versão para Windows 64 bits, instale e clique neste botão de novo.")
  exit 1
}
if (Achar) { [Console]::Out.WriteLine('OK OpenRGB instalado') }
else { [Console]::Out.WriteLine('ERRO O OpenRGB não ficou instalado. Tente de novo.'); exit 1 }
