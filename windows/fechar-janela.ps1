# "Jarvis, desligar": fecha a janela do Jarvis no Edge (so a do perfil JarvisEdge).
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |
  Where-Object { $_.CommandLine -like '*JarvisEdge*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
