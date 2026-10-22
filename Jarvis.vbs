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

' Quando abre junto com o Windows (atalho da pasta Inicializar passa "inicio"), roda a rotina.txt.
endereco = "http://127.0.0.1:3000/?auto"
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "inicio" Then endereco = endereco & "&rotina"
End If

' Perfil separado do Edge: deixa o Jarvis falar sem clique e lembra a permissao do microfone.
' Abre em tela cheia (F11 sai). As opcoes "background" deixam ele ouvindo mesmo minimizado.
perfil = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\JarvisEdge"
opcoes = " --user-data-dir=""" & perfil & """ --autoplay-policy=no-user-gesture-required --start-fullscreen --no-first-run" & _
  " --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows"
sh.Run "cmd /c start """" msedge --app=""" & endereco & """" & opcoes, 0, False
