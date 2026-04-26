Set WshShell = CreateObject("WScript.Shell")
strDir = Left(WScript.ScriptFullName, Len(WScript.ScriptFullName) - Len(WScript.ScriptName) - 1)

' Create desktop shortcut
Set oShortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Desktop") & "\FileVault.lnk")
oShortcut.TargetPath = "wscript.exe"
oShortcut.Arguments = Chr(34) & strDir & "\启动FileVault无窗口.vbs" & Chr(34)
oShortcut.WorkingDirectory = strDir
oShortcut.Description = "FileVault 文件同步系统"
oShortcut.Save

MsgBox "桌面快捷方式已创建！", vbInformation, "FileVault"
