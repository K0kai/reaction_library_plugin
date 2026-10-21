# SPDX-License-Identifier: GPL-3.0-or-later
param(
    [Parameter(Mandatory=$true)][string]$Zip,
    [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{40}$')][string]$ExpectedSignerThumbprint
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$content=New-Object Security.Cryptography.Pkcs.ContentInfo -ArgumentList (,[IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Zip)))
$cms=New-Object Security.Cryptography.Pkcs.SignedCms -ArgumentList $content,$true
$cms.Decode([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath "$Zip.p7s")))
$cms.CheckSignature($false)
if ($cms.SignerInfos.Count -ne 1 -or $cms.SignerInfos[0].Certificate.Thumbprint -ne $ExpectedSignerThumbprint) {throw 'The release is not signed by the expected publisher.'}
Write-Output "Verified release and certificate trust: $($cms.SignerInfos[0].Certificate.Subject)"
