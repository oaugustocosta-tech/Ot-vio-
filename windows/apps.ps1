# Lista os programas do menu Iniciar (nome e AppID) em JSON.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
@(Get-StartApps | Select-Object Name, AppID) | ConvertTo-Json -Compress
