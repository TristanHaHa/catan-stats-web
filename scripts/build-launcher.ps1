$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
Push-Location $repoPath
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    $compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    if (!(Test-Path -LiteralPath $compilerPath)) { $compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
    if (!(Test-Path -LiteralPath $compilerPath)) { throw 'The Windows .NET Framework C# compiler is required.' }
    New-Item -ItemType Directory -Force -Path 'launcher/build' | Out-Null
    Copy-Item -LiteralPath 'LICENSE' -Destination 'dist/LICENSE.txt'
    Compress-Archive -Path 'dist/*' -DestinationPath 'launcher/build/site.zip' -Force
    & $compilerPath /nologo /target:winexe /optimize+ '/out:Catan Stats.exe' /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.IO.Compression.dll '/resource:launcher\build\site.zip,site.zip' 'launcher\Launcher.cs'
    if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
    Write-Output "Ready: $(Join-Path $repoPath 'Catan Stats.exe')"
} finally { Pop-Location }
