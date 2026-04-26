Set WshShell = CreateObject("WScript.Shell")
strDir = Left(WScript.ScriptFullName, Len(WScript.ScriptFullName) - Len(WScript.ScriptName) - 1)

' Run node in background with hidden window
WshShell.CurrentDirectory = strDir
WshShell.Run "cmd /c node server.js", 0, False

MsgBox "FileVault 已启动！" & vbCrLf & vbCrLf & _
       "本机访问: http://localhost:8888" & vbCrLf & _
       "局域网: http://172.25.67.48:8888", vbInformation, "FileVault"
