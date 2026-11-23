<#
.SYNOPSIS
  One-time STAGING setup for the talking-avatar Preview. To be run by the project owner (it handles keys; Claude does not).

.DESCRIPTION
  1. Pulls the STAGING Supabase settings from the Vercel Preview variables of a branch that already points at staging
     (feat/cinema-m1-persistence by default) into a temporary file.
  2. Refuses to continue unless NEXT_PUBLIC_SUPABASE_URL belongs to the staging project (hhearpympdflxyfmszap).
  3. Creates the Modal secret `alphogenai-comfy-broker` in the isolated environment `comfy-staging`
     (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COMFY_DISPATCH_SECRET).
  4. Adds the Preview variables of the avatar branch ONLY (so no other branch and not Production is affected).
  5. Deletes the temporary files. No value is ever printed.

  Prerequisites: `npx vercel` logged in as the project owner, `python -m modal` logged in (workspace alpahoo).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\avatar-staging\prepare-staging-secrets.ps1
#>
param(
  [string]$Branch = "claude/longcat-avatar-integration",
  [string]$DonorBranch = "feat/cinema-m1-persistence",
  [string]$ModalEnv = "comfy-staging"
)
$ErrorActionPreference = "Stop"
$Team = "team_kq6TRybfPHjJYkfAlQXGDpI2"
$Project = "prj_D2woxz7R5y0hBB1pd0WQGYmWGkDV"
$StagingRef = "hhearpympdflxyfmszap"
$work = Join-Path $env:TEMP ("avatar-staging-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work | Out-Null
$pulled = Join-Path $work "donor.env"
$modalEnvFile = Join-Path $work "broker.env"

function Read-DotEnv([string]$path) {
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $path -Encoding UTF8) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $i = $line.IndexOf('=')
    $key = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    if ($val.Length -ge 2 -and $val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
    $map[$key] = $val
  }
  return $map
}

try {
  Write-Host "1/4 Pulling the staging Preview settings of '$DonorBranch' (values stay in a temporary file)..."
  & npx --yes vercel@latest env pull $pulled --environment=preview --git-branch=$DonorBranch --scope $Team --project $Project --yes | Out-Null
  if (-not (Test-Path $pulled)) { throw "vercel env pull produced no file" }
  $env_ = Read-DotEnv $pulled

  foreach ($k in "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_ADMIN_EMAILS") {
    if (-not $env_.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($env_[$k])) { throw "Missing $k on the donor branch '$DonorBranch'. Nothing was written." }
  }
  if ($env_["NEXT_PUBLIC_SUPABASE_URL"] -notmatch [regex]::Escape($StagingRef)) {
    throw "SAFETY STOP: the donor branch does not point at the staging project ($StagingRef). Nothing was written."
  }
  Write-Host "    OK: the donor settings point at the staging project."

  $dispatchSecret = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })

  Write-Host "2/4 Creating the Modal secret alphogenai-comfy-broker in environment '$ModalEnv'..."
  Set-Content -LiteralPath $modalEnvFile -Encoding UTF8 -Value @(
    "SUPABASE_URL=$($env_['NEXT_PUBLIC_SUPABASE_URL'])",
    "SUPABASE_SERVICE_ROLE_KEY=$($env_['SUPABASE_SERVICE_ROLE_KEY'])",
    "COMFY_DISPATCH_SECRET=$dispatchSecret")
  $env:PYTHONUTF8 = "1"
  & python -m modal secret create alphogenai-comfy-broker --env $ModalEnv --from-dotenv $modalEnvFile --force | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "modal secret create failed" }

  Write-Host "3/4 Adding the Preview variables of branch '$Branch' only..."
  $vars = [ordered]@{
    "NEXT_PUBLIC_SUPABASE_URL"                      = $env_["NEXT_PUBLIC_SUPABASE_URL"]
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"                 = $env_["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY"  = $(if ($env_.ContainsKey("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY")) { $env_["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY"] } else { $env_["NEXT_PUBLIC_SUPABASE_ANON_KEY"] })
    "SUPABASE_SERVICE_ROLE_KEY"                     = $env_["SUPABASE_SERVICE_ROLE_KEY"]
    "NEXT_PUBLIC_ADMIN_EMAILS"                      = $env_["NEXT_PUBLIC_ADMIN_EMAILS"]
    "COMFY_LONGCAT_ENABLED"                         = "true"
    "COMFY_DISPATCH_SECRET"                         = $dispatchSecret
  }
  foreach ($name in $vars.Keys) {
    $vars[$name] | & npx --yes vercel@latest env add $name preview --git-branch $Branch --force --scope $Team --project $Project | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "vercel env add $name failed" }
    Write-Host "    set $name"
  }
  Write-Host "4/4 Done. Tell Claude: 'secrets ready' (and give the approved Modal region)."
}
finally {
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Variable env_, dispatchSecret, vars -ErrorAction SilentlyContinue
}
