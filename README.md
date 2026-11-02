# navidrome-rpc

A Rust application that shows the track playing on a Subsonic-compatible server in Discord Rich Presence.

## Run

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and copy its application ID.
2. Copy `config.example.json` to `config.json` and fill in the Discord application ID, Subsonic username, password, and server URL. Use HTTPS for a remote server.
3. Start the Discord desktop app and play music through a Subsonic-compatible client.
4. Run `cargo run --release` from the directory containing `config.json`.

Build a release archive with `python3 scripts/build.py` (use `python` on Windows). This command removes the old `dist` directory, builds the current Rust source, and creates a zip containing the executable and `config.json`. Extract the zip, edit `config.json`, and launch the executable from that directory. Rust, Cargo, and Python are needed to build, but not to run the compiled binary.

The app retries its connection when Discord is unavailable. It clears activity when playback pauses, stops, or disappears from the server. It polls the server once per second while a track is active.

## Development

Run `cargo test` and `cargo clippy --all-targets -- -D warnings`.
