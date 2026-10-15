# Read-only prerequisite check. Does not read .env or inspect containers.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker nao encontrado. Instale e abra o Docker Desktop conforme docs/INSTALACAO-CLINICA-WINDOWS.md.'
}

function Invoke-DockerProbe {
    param([string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & docker @Arguments 2>$null
        $probeExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($probeExit -ne 0) {
        throw 'Docker indisponivel ou comando nao suportado. Abra o Docker Desktop e confira o contexto ativo; tente novamente.'
    }
    return ($output -join "`n").Trim()
}

$engineType = Invoke-DockerProbe -Arguments @('info', '--format', '{{.OSType}}')
if ($engineType -ne 'linux') {
    throw 'O ERP exige containers Linux. Ajuste o Docker Desktop antes de continuar.'
}
$composeVersion = Invoke-DockerProbe -Arguments @('compose', 'version', '--short')
if ($composeVersion -notmatch '^v?(\d+)\.') {
    throw 'Nao foi possivel reconhecer a versao do Docker Compose.'
}
if ([int]$Matches[1] -lt 2) { throw 'Docker Compose v2 ou superior necessario.' }
Write-Host 'OK: engine Linux acessivel e Docker Compose disponivel.'
Write-Host 'Verificacao somente de pre-requisitos Docker. Nao comprova instalacao, TLS, backup, capacidade ou acesso pela rede.'
