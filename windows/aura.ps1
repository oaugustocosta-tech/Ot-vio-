# Controle do LED pelo ASUS Aura (servico de iluminacao do Armoury Crate).
# Fica aberto recebendo comandos, um por linha: "cor <numero>" ou "soltar".
# Responde OK ou ERRO para cada um. Ao fechar, devolve o controle ao Armoury Crate.
try { $sdk = New-Object -ComObject aura.sdk.1 } catch { [Console]::Out.WriteLine('ERRO sdk ' + $_.Exception.Message); exit 1 }
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
      $placas = 0
      $luzes = 0
      foreach ($dev in $sdk.Enumerate(0)) {
        $placas++
        foreach ($luz in $dev.Lights) { $luz.Color = $cor; $luzes++ }
        $dev.Apply()
      }
      # Diz quantos aparelhos e luzes recebeu, para saber se o Aura enxergou o LED do gabinete.
      if ($placas -eq 0) { [Console]::Out.WriteLine('ERRO nenhum'); continue }
      [Console]::Out.WriteLine("OK $placas $luzes")
      continue
    }
    [Console]::Out.WriteLine('OK')
  } catch { [Console]::Out.WriteLine('ERRO ' + $_.Exception.Message) }
}
if ($ativo) { $sdk.ReleaseControl(0) }
