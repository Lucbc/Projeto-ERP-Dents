# Read-only Git preflight. Does not fetch, checkout, read .env or call Docker.
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^piloto-cadastros-v[0-9]+\.[0-9]+\.[0-9]+$')][string]$TargetTag,
    [string]$Repository = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
function Invoke-VersionGit {
    param([string[]]$Arguments)
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & git -C $Repository @Arguments 2>$null
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($code -ne 0) { throw 'Conferencia Git falhou. Confira repositorio, tag local e historico completo; nenhuma alteracao realizada.' }
    return ($output -join "`n").Trim()
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git nao encontrado.' }
if ((Invoke-VersionGit @('rev-parse', '--is-inside-work-tree')) -ne 'true') { throw 'Repositorio de trabalho necessario.' }
if ((Invoke-VersionGit @('rev-parse', '--is-shallow-repository')) -ne 'false') { throw 'Historico incompleto. O suporte deve obter o historico antes da conferencia.' }
if (Invoke-VersionGit @('status', '--porcelain=v1', '--untracked-files=all')) {
    throw 'Existem alteracoes locais ou arquivos nao rastreados. Preserve e revise antes da atualizacao; nao use reset ou clean para contornar.'
}
$current = Invoke-VersionGit @('rev-parse', '--verify', 'HEAD')
$target = Invoke-VersionGit @('rev-parse', '--verify', ('refs/tags/' + $TargetTag + '^{commit}'))
foreach ($revision in @($current, $target)) {
    if ($revision -notmatch '^[a-f0-9]{40}$') { throw 'Identificador Git inesperado.' }
}
# Refuse rollback and unrelated histories; this is not a migration compatibility check.
$null = Invoke-VersionGit @('merge-base', '--is-ancestor', $current, $target)
foreach ($path in @('docker-compose.yml', 'scripts/backup-server.ps1', 'docs/INSTALACAO-CLINICA-WINDOWS.md')) {
    $null = Invoke-VersionGit @('cat-file', '-e', ($target + ':' + $path))
}
Write-Host 'OK: codigo limpo, tag local resolvida e historico compativel com avanco.'
Write-Host ('Atual: ' + $current)
Write-Host ('Destino: ' + $TargetTag + ' (' + $target + ')')
if ($current -eq $target) { Write-Host 'Codigo ja esta na versao escolhida; isto nao verifica as imagens em execucao.' }
Write-Host 'Nao comprova aprovacao da tag, backup, migracoes, imagens, TLS ou acesso dos usuarios. Siga o roteiro assistido.'
