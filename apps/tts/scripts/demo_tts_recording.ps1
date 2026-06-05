$ErrorActionPreference = "Stop"

function Show-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host "=== $Text ===" -ForegroundColor Cyan
  Start-Sleep -Seconds 2
}

Clear-Host
Write-Host "Local GPT-SoVITS TTS demo" -ForegroundColor Green
Write-Host "This recording shows live text-to-speech synthesis, not replaying fixed samples."
Start-Sleep -Seconds 3

Show-Step "1. Check unified TTS API health"
Invoke-RestMethod http://127.0.0.1:8008/health | ConvertTo-Json -Depth 5
Start-Sleep -Seconds 3

Show-Step "2. List selectable voices"
Write-Host "gentle_female  | gentle female voice"
Write-Host "lively_female  | lively female voice"
Write-Host "announcer_male | announcer male voice"
Start-Sleep -Seconds 3

Show-Step "3. Send new text to synthesize"
$text = "Welcome to the smart radio demo. This is new text typed for the recording, and the system will synthesize it now."
$voice = "announcer_male"
$out = "outputs\recording_demo_$voice.wav"
$body = @{
  text = $text
  voice = $voice
} | ConvertTo-Json

Write-Host "Text:" $text
Write-Host "Voice:" $voice
Write-Host "Output:" $out
Start-Sleep -Seconds 2

Invoke-WebRequest `
  -Uri "http://127.0.0.1:8008/synthesize" `
  -Method POST `
  -ContentType "application/json; charset=utf-8" `
  -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) `
  -OutFile $out

Show-Step "4. Confirm generated audio file"
Get-Item $out | Select-Object FullName,Length,LastWriteTime | Format-List
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Demo complete. The wav file was generated from the text shown above." -ForegroundColor Green
Start-Sleep -Seconds 5
