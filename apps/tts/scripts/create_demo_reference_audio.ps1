$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

$items = @(
  @{
    Path = "assets\voices\gentle_female.wav"
    Voice = "Microsoft Zira Desktop"
    Text = "Today is calm and comfortable, perfect for a gentle song."
    Rate = -2
  },
  @{
    Path = "assets\voices\lively_female.wav"
    Voice = "Microsoft Zira Desktop"
    Text = "Are you ready? Let us start today's happy playlist right now."
    Rate = 2
  },
  @{
    Path = "assets\voices\announcer_male.wav"
    Voice = "Microsoft David Desktop"
    Text = "Welcome to the smart radio show. Here is today's recommendation."
    Rate = 0
  }
)

New-Item -ItemType Directory -Force -Path "assets\voices" | Out-Null

foreach ($item in $items) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice($item.Voice)
  $synth.Rate = $item.Rate
  $synth.SetOutputToWaveFile((Resolve-Path ".").Path + "\" + $item.Path)
  $synth.Speak($item.Text)
  $synth.Dispose()
  Write-Host "Created $($item.Path)"
}
