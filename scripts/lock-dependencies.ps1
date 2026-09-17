param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $toolPython = Join-Path $root '.data/dependency-tools/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $toolPython)) {
        & $Python -m venv .data/dependency-tools
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar ambiente de ferramentas. Use Python 3.12.' }
    }
    & $toolPython -m pip install --require-hashes -r scripts/requirements-tools.txt
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar ferramentas verificadas.' }
    & $toolPython -m uv pip compile apps/api/requirements.in --universal --python-version 3.12 --generate-hashes --no-emit-index-url -o apps/api/requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao resolver dependencias da API.' }
    & npm install --prefix apps/web --package-lock-only --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao resolver dependencias web.' }
    Write-Host 'Locks atualizados. Revise o diff e execute auditoria, build e testes antes de publicar.'
} finally { Pop-Location }
