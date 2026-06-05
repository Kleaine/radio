param(
  [string]$InstallDir = "external\GPT-SoVITS",
  [ValidateSet("CPU", "CU126", "CU128")]
  [string]$Device = "CPU",
  [ValidateSet("HF", "HF-Mirror", "ModelScope")]
  [string]$Source = "ModelScope"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is required but was not found in PATH."
}

if (-not (Test-Path $InstallDir)) {
  git clone https://github.com/RVC-Boss/GPT-SoVITS.git $InstallDir
}

Push-Location $InstallDir
try {
  if (Test-Path ".\install.ps1") {
    $PowerShellExe = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
    if (-not $PowerShellExe) {
      $PowerShellExe = (Get-Command powershell -ErrorAction Stop).Source
    }
    & $PowerShellExe -ExecutionPolicy Bypass -File .\install.ps1 -Device $Device -Source $Source
  } else {
    python -m pip install -r requirements.txt
  }
}
finally {
  Pop-Location
}
