param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TestArgs
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$rustProject = Join-Path $projectRoot 'src-tauri'
$previousRustFlags = [Environment]::GetEnvironmentVariable('CARGO_ENCODED_RUSTFLAGS', 'Process')
$manifestDependency = "link-arg=/manifestdependency:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"

try {
    $env:CARGO_ENCODED_RUSTFLAGS = @('-C', 'link-arg=/MANIFEST:EMBED', '-C', $manifestDependency) -join [char]0x1f
    Push-Location $rustProject
    cargo test --lib -- @TestArgs
}
finally {
    if ($null -eq $previousRustFlags) {
        Remove-Item Env:CARGO_ENCODED_RUSTFLAGS -ErrorAction SilentlyContinue
    }
    else {
        $env:CARGO_ENCODED_RUSTFLAGS = $previousRustFlags
    }
    Pop-Location
}
