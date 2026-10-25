# Synthetic HEIC fixtures

Source: [heic-rs](https://github.com/tbraun96/heic-rs/tree/999470f514c8e9a1a7c37ea44ba70cc32b1308fe/tests/fixtures), commit `999470f514c8e9a1a7c37ea44ba70cc32b1308fe`. MIT license included.

The upstream generator synthesizes every pixel: `gradient-512.heic` is a 512×512 color gradient; `checker-1024.heic` is a 1024×1024 checkerboard encoded as a HEIC tile grid. No personal photograph is included. Tests decode actual HEVC bytes and encode/inspect the JPEG result; renaming a file cannot pass.

`gradient-512.jpg` is the application's real Rust conversion of `gradient-512.heic`, generated with pinned heic-rs 0.1.4 and image 0.25.10 (JPEG quality 82). The Rust regression asserts byte equality; the live COS integration uploads both source and derivative and verifies their hashes.
