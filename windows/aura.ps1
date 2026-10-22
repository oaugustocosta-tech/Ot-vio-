# Controle do LED pelo ASUS Aura (servico de iluminacao do Armoury Crate).
# Fica aberto recebendo comandos, um por linha: "cor <numero>" ou "soltar".
# Responde OK ou ERRO para cada um. Ao fechar, devolve o controle ao Armoury Crate.
try { $sdk = New-Object -ComObject aura.sdk.1 } catch { [Console]::Out.WriteLine('ERRO sdk'); exit 1 }
[Console]::Out.WriteLine('PRONTO')
$ativo = $false
while ($true) {
  $linha = [Console]::In.ReadLine()
  if ($null -eq $linha) { break }
  try {
    $p = $linha.Split(' ')
    if ($p[0] -eq 'soltar') {
      if ($ativo) { $sdk.ReleaseControl(0); $ativo = $false }
    } else {
      if (-not $ativo) { $sdk.SwitchMode(); $ativo = $true }
      $cor = [uint32]$p[1]
      foreach ($dev in $sdk.Enumerate(0)) {
        foreach ($luz in $dev.Lights) { $luz.Color = $cor }
        $dev.Apply()
      }
    }
    [Console]::Out.WriteLine('OK')
  } catch { [Console]::Out.WriteLine('ERRO ' + $_.Exception.Message) }
}
if ($ativo) { $sdk.ReleaseControl(0) }
