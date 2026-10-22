'Abre o Ultron: liga o servidor escondido e abre a janela dele no Microsoft Edge.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta

' Se o servidor ja estiver rodando, este segundo fecha sozinho (porta ocupada) e nada muda.
sh.Run "cmd /c node --env-file-if-exists=.env server.js > ultron.log 2>&1", 0, False
WScript.Sleep 2500

' Perfil separado do Edge: deixa o Ultron falar sem clique e lembra a permissao do microfone.
perfil = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\UltronEdge"
sh.Run "cmd /c start """" msedge --app=http://localhost:3000/?auto --user-data-dir=""" & perfil & """ --autoplay-policy=no-user-gesture-required --window-size=960,820 --no-first-run", 0, False
