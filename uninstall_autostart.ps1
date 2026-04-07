$dst = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\FileVault.vbs"
if (Test-Path $dst) {
    Remove-Item $dst -Force
    Write-Host "Auto-start removed successfully!"
} else {
    Write-Host "Auto-start not found."
}
