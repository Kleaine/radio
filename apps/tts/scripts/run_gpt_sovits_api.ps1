param(
  [string]$RepoDir = "external\GPT-SoVITS",
  [int]$Port = 9880
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $RepoDir)) {
  throw "GPT-SoVITS repo not found: $RepoDir. Run scripts/setup_gpt_sovits.ps1 first."
}

Push-Location $RepoDir
try {
  $Python = ".\.venv\Scripts\python.exe"
  if (-not (Test-Path $Python)) {
    $Python = "python"
  }

  & $Python api_v2.py -a 127.0.0.1 -p $Port -c GPT_SoVITS/configs/tts_infer.yaml
}
finally {
  Pop-Location
}
