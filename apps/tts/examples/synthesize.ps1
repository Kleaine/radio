param(
  [string]$Text = "欢迎收听智能电台，现在为你推荐一首适合今天心情的歌曲。",
  [string]$Voice = "announcer_male"
)

$body = @{
  text = $Text
  voice = $Voice
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri "http://127.0.0.1:8008/synthesize" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body `
  -OutFile "outputs\demo_$Voice.wav"
