$ErrorActionPreference = "Stop"

$Python = ".\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
  $Python = "python"
}

@'
from pathlib import Path
import requests
import time

cases = [
    ("announcer_male", "\u6b22\u8fce\u6536\u542c\u667a\u80fd\u7535\u53f0\u3002"),
    ("gentle_female", "\u4eca\u5929\u9002\u5408\u542c\u4e00\u9996\u6e29\u67d4\u7684\u6b4c\u3002"),
    ("lively_female", "\u51c6\u5907\u597d\u4e86\u5417\uff0c\u5feb\u4e50\u6b4c\u5355\u9a6c\u4e0a\u5f00\u59cb\u3002"),
]

health = requests.get("http://127.0.0.1:8008/health", timeout=5).json()
assert health["status"] == "ok", health
assert health["gpt_sovits_reachable"] is True, health
print("health ok")

out_dir = Path("outputs")
out_dir.mkdir(exist_ok=True)

for voice, text in cases:
    start = time.time()
    res = requests.post(
        "http://127.0.0.1:8008/synthesize",
        json={"voice": voice, "text": text},
        timeout=900,
    )
    assert res.status_code == 200, res.text
    out_path = out_dir / f"verify_{voice}.wav"
    out_path.write_bytes(res.content)
    assert out_path.stat().st_size > 10_000, out_path
    print(f"{voice} ok -> {out_path} ({out_path.stat().st_size} bytes, {time.time() - start:.1f}s)")
'@ | & $Python -
