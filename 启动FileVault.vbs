Set WshShell = CreateObject("WScript.Shell")
Set oShell = CreateObject("Shell.Application")

' Get the directory where this script is located
strDir = Left(WScript.ScriptFullName, Len(WScript.ScriptFullName) - Len(WScript.ScriptName) - 1)

' Create a shortcut on Desktop
Set oShortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") & "\FileVault.lnk")
oShortcut.TargetPath = "cmd.exe"
oShortcut.Arguments = "/c cd /d " & strDir & " && node server.js"
oShortcut.WorkingDirectory = strDir
oShortcut.Description = "FileVault 文件同步系统"
oShortcut.IconLocation = "cmd.exe,0"
oShortcut.Save

MsgBox "已创建桌面快捷方式！", vbInformation, "FileVault"
