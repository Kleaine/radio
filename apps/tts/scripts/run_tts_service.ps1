$ErrorActionPreference = "Stop"
$Python = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  $Python = "python"
}

& $Python -m uvicorn tts_service.main:app --host 127.0.0.1 --port 8008 --reload
