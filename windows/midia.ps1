# Aperta uma tecla de midia do Windows (tocar/pausar, proxima, volume...) algumas vezes.
param([int]$Tecla, [int]$Vezes = 1)
$shell = New-Object -ComObject WScript.Shell
1..$Vezes | ForEach-Object { $shell.SendKeys([string][char]$Tecla) }
