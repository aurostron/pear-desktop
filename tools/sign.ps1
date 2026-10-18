# Sign the release exe with the local "Pear Desktop" self-signed certificate.
#
# Recreate the certificate on a fresh machine with:
#   New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Pear Desktop" `
#     -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(3)
#
# Self-signed => other machines show "Unknown publisher" and SmartScreen
# still warns until the certificate is trusted. To trust it locally, import
# dist\pear-desktop-dev.cer into "Trusted People" (CurrentUser).
param(
  [string]$File = (Join-Path $PSScriptRoot '..\dist\pear-desktop-0.1.0-x64.exe'),
  [string]$Subject = 'CN=Pear Desktop',
  [string]$TimestampUrl = 'http://timestamp.digicert.com'
)
$ErrorActionPreference = 'Stop'

$cert = Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Subject -eq $Subject -and $_.HasPrivateKey } |
  Select-Object -First 1
if (-not $cert) { throw "No private-key certificate '$Subject' in Cert:\CurrentUser\My" }

$signtool = (Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1).FullName
if (-not $signtool) {
  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { $signtool = $cmd.Source }
}
if (-not $signtool) { throw 'signtool.exe not found (install the Windows SDK signing tools)' }

& $signtool sign /sha1 $cert.Thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $File
if ($LASTEXITCODE -ne 0) { throw "signtool sign failed (exit $LASTEXITCODE)" }

# Status will read "UnknownError / untrusted root" for a self-signed cert --
# that is expected; the signature itself and the timestamp chain are verified.
Get-AuthenticodeSignature $File |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
