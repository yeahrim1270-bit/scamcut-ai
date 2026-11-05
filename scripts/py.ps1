# 백엔드용 Python 실행기: backend\.python (임베디드) → backend\.venv → 시스템 python 순서로 찾아 인자를 그대로 전달합니다.
$root = Split-Path -Parent $PSScriptRoot
$candidates = @(
  (Join-Path $root "backend\.python\python.exe"),
  (Join-Path $root "backend\.venv\Scripts\python.exe")
)
$py = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $py) {
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source -notlike "*WindowsApps*") { $py = $cmd.Source }
}
if (-not $py) {
  Write-Error "Python 을 찾을 수 없습니다. 먼저 'npm run setup:api' 를 실행하세요."
  exit 1
}
& $py @args
exit $LASTEXITCODE
