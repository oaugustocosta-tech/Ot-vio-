'Abre o Jarvis: liga o servidor escondido e abre a janela dele no Microsoft Edge.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta

' Fecha um servidor do Jarvis que tenha ficado aberto (por exemplo, de uma versao antiga
' ou de uma pasta que foi apagada) e liga um novo, desta pasta.
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
For Each p In wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name='node.exe'")
  cmd = p.CommandLine & ""
  If InStr(cmd, "server.js") > 0 And InStr(cmd, "env-file") > 0 Then p.Terminate
Next
WScript.Sleep 500

sh.Run "cmd /c node --env-file-if-exists=.env server.js > jarvis.log 2>&1", 0, False
WScript.Sleep 2500

' Perfil separado do Edge: deixa o Jarvis falar sem clique e lembra a permissao do microfone.
perfil = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\JarvisEdge"
sh.Run "cmd /c start """" msedge --app=http://localhost:3000/?auto --user-data-dir=""" & perfil & """ --autoplay-policy=no-user-gesture-required --window-size=960,820 --no-first-run", 0, False
