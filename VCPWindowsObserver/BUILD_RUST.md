# Build Instructions

This plugin has been rewritten in Rust. To use it, you must compile the Rust source code into an executable.

## Prerequisites

1.  **Rust Toolchain**: Install Rust from [rustup.rs](https://rustup.rs/).
2.  **Windows**: This plugin only works on Windows.

## Compilation

1.  Open a terminal (Command Prompt or PowerShell).
2.  Navigate to the `VCPWindowsObserver/rust_impl` directory.
3.  Run the build command:
    ```bash
    cargo build --release
    ```
4.  Upon success, the executable will be located at `VCPWindowsObserver/rust_impl/target/release/vcp_windows_observer.exe`.

## Installation

1.  Copy `vcp_windows_observer.exe` from `rust_impl/target/release/` to the root of the `VCPWindowsObserver` folder (same directory as `plugin-manifest.json`).
    *   Alternatively, you can update `plugin-manifest.json` to point to the full path of the executable. The current configuration assumes `vcp_windows_observer.exe` is in the root of the plugin folder.

## Verification

You can run the test client (requires Python) to verify the executable:
1.  Ensure `vcp_windows_observer.exe` is in the root folder.
2.  Modify `vcp_test_client.py` to call the `.exe` instead of `main.py` (Update the `subprocess.Popen` call).
3.  Run `python vcp_test_client.py`.
