# FitZone Unified Release - GitHub attestation acceptance gate.
# Acceptance is independent of deployment authorization.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$ArchivePath,

    [Parameter(Mandatory=$true)]
    [string]$ManifestPath,

    [Parameter(Mandatory=$true)]
    [string]$ApprovedWorkflowCommit
)

$ErrorActionPreference = "Stop"

$expectedRepo = "MrCCcrew/FitZone-App"
$expectedWorkflow = "github.com/MrCCcrew/FitZone-App/.github/workflows/fitzone-unified-attested-candidate.yml"
$expectedWorkflowCommit = $ApprovedWorkflowCommit
$expectedRef = "refs/heads/infra/fitzone-deploy-tools-only-20261104"
$minimumGh = [version]"2.102.0"

function Block([string]$Reason) {
    Write-Host "ATTESTATION_ACCEPTANCE=BLOCKED"
    Write-Host "REASON=$Reason"
    exit 1
}

try {
    if ($expectedWorkflowCommit -cnotmatch '^[0-9a-f]{40}$') {
        Block "INVALID_APPROVED_WORKFLOW_COMMIT"
    }

    # No independently trusted workflow-commit approval source exists yet.
    # A caller-supplied SHA is not authorization.
    # Remove this block only in a separately reviewed security change
    # that establishes and verifies an external approval policy.
    Block "EXTERNAL_WORKFLOW_APPROVAL_NOT_CONFIGURED"

    $versionOutput = @(& gh --version 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Block "GITHUB_CLI_UNAVAILABLE"
    }

    $firstLine = [string]$versionOutput[0]
    $match = [regex]::Match(
        $firstLine,
        '^gh version (\d+\.\d+\.\d+)'
    )

    if (!$match.Success) {
        Block "GITHUB_CLI_VERSION_UNRECOGNIZED"
    }

    $installed = [version]$match.Groups[1].Value

    if ($installed -lt $minimumGh) {
        Write-Host "INSTALLED_GH=$installed"
        Write-Host "MINIMUM_GH=$minimumGh"
        Block "GITHUB_CLI_SECURITY_VERSION_TOO_OLD"
    }

    if (![System.IO.File]::Exists($ArchivePath)) {
        Block "CANDIDATE_ARCHIVE_MISSING"
    }

    $archive = (
        Resolve-Path -LiteralPath $ArchivePath
    ).Path

    if ((Get-Item -LiteralPath $archive).Length -eq 0) {
        Block "CANDIDATE_ARCHIVE_EMPTY"
    }

    $arguments = @(
        "attestation", "verify", $archive,
        "--repo", $expectedRepo,
        "--signer-workflow", $expectedWorkflow,
        "--signer-digest", $expectedWorkflowCommit,
        "--source-digest", $expectedWorkflowCommit,
        "--source-ref", $expectedRef,
        "--deny-self-hosted-runners",
        "--format", "json"
    )

    $response = @(& gh @arguments 2>&1)
    if ($LASTEXITCODE -ne 0) {
        Block "CRYPTOGRAPHIC_ATTESTATION_VERIFICATION_FAILED"
    }

    $json = ($response | Out-String) | ConvertFrom-Json

    if (@($json).Count -lt 1) {
        Block "NO_VERIFIED_ATTESTATIONS"
    }

    $actualDigest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()

    foreach ($item in @($json)) {
        if (!$item.verificationResult -or
            !$item.verificationResult.statement -or
            !$item.verificationResult.signature.certificate) {
            Block "VERIFICATION_RESULT_INCOMPLETE"
        }

        $subjects = @($item.verificationResult.statement.subject)
        if ($subjects.Count -ne 1 -or $null -eq $subjects[0]) {
            Block "ATTESTATION_SUBJECT_INVALID"
        }

        $subjectDigest = [string]$subjects[0].digest.sha256
        if ($subjectDigest -notmatch '^[0-9a-fA-F]{64}$') {
            Block "ATTESTATION_SUBJECT_DIGEST_MISSING"
        }

        if ($subjectDigest.ToLowerInvariant() -cne $actualDigest) {
            Block "ATTESTATION_ARCHIVE_DIGEST_MISMATCH"
        }
    }

    Write-Host "ATTESTATION_ARCHIVE_SHA256=MATCH"
    Write-Host "ATTESTATION_CRYPTOGRAPHY=VERIFIED"
    Write-Host "SIGNER_WORKFLOW=PINNED"
    Write-Host "WORKFLOW_COMMIT=PINNED"
    Write-Host "ATTESTATION_SIGNATURE_GATE=PASS"

    if (![System.IO.File]::Exists($ManifestPath)) {
        Block "MANIFEST_V2_MISSING"
    }

    $manifest = (Resolve-Path -LiteralPath $ManifestPath).Path

    $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
    $payloadVerifier = Join-Path $scriptDirectory "verify-attested-payload.py"
    $manifestTool = Join-Path $scriptDirectory "fitzone-artifact-manifest.py"

    if (![System.IO.File]::Exists($payloadVerifier) -or
        ![System.IO.File]::Exists($manifestTool)) {
        Block "TRUSTED_PAYLOAD_VERIFIER_UNAVAILABLE"
    }

    function ToWslPath([string]$WindowsPath) {
        $value = @(& wsl.exe --exec wslpath -u $WindowsPath 2>&1)
        if ($LASTEXITCODE -ne 0 -or $value.Count -ne 1) {
            Block "WSL_PATH_CONVERSION_FAILED"
        }

        $converted = ([string]$value[0]).Trim()
        if (!$converted.StartsWith("/")) {
            Block "WSL_PATH_CONVERSION_INVALID"
        }

        return $converted
    }

    $linuxArchive = ToWslPath $archive
    $linuxManifest = ToWslPath $manifest
    $linuxVerifier = ToWslPath $payloadVerifier
    $linuxTool = ToWslPath $manifestTool

    # Do not allow an inherited stdin or an unbounded WSL subprocess
    # to leave the release acceptance gate hanging.
    $paths = @(
        $linuxVerifier, $linuxArchive, $linuxManifest, $linuxTool
    )

    foreach ($value in $paths) {
        if ($value -match '[\x00-\x1f"]') {
            Block "INVALID_WSL_ARGUMENT"
        }
    }

    $arguments = @(
        "--exec", "python3", "-B",
        ('"' + $linuxVerifier + '"'),
        "--archive", ('"' + $linuxArchive + '"'),
        "--manifest", ('"' + $linuxManifest + '"'),
        "--manifest-tool", ('"' + $linuxTool + '"')
    ) -join " "

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "wsl.exe"
    $startInfo.Arguments = $arguments
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo

    try {
        if (!$process.Start()) {
            Block "PAYLOAD_PROCESS_START_FAILED"
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Close()

        if (!$process.WaitForExit(30000)) {
            try { $process.Kill() } catch {}
            Block "PAYLOAD_VERIFICATION_TIMEOUT"
        }

        $payloadExit = $process.ExitCode
        $payloadText = $stdoutTask.GetAwaiter().GetResult()
        $payloadError = $stderrTask.GetAwaiter().GetResult()

        if ($payloadError) {
            Write-Host ("PAYLOAD_DIAGNOSTIC=" + $payloadError.Trim())
        }
    }
    finally {
        $process.Dispose()
    }

    if ($payloadExit -ne 0 -or
        !$payloadText.Contains("PAYLOAD_INTEGRITY=PASS") -or
        !$payloadText.Contains("ATTESTED_PAYLOAD_MANIFEST_V2=PASS")) {
        Block "ATTESTED_PAYLOAD_VERIFICATION_FAILED"
    }

    Write-Host "MANIFEST_V2_VERIFICATION=PASS"
    Write-Host "APPLICATION_SOURCE_VERIFICATION=PASS"
    Write-Host "ATTESTATION_ACCEPTANCE=PASS"
    Write-Host "DEPLOYMENT=NONE"
}
catch {
    Write-Host ("VERIFIER_EXCEPTION_TYPE=" + $_.Exception.GetType().Name)
    Write-Host ("VERIFIER_EXCEPTION_MESSAGE=" + $_.Exception.Message)
    Write-Host ("VERIFIER_EXCEPTION_LINE=" + $_.InvocationInfo.ScriptLineNumber)
    Block "VERIFIER_EXECUTION_FAILED"
}
