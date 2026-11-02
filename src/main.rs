mod discord;
mod subsonic;

use discord::Discord;
use discord_rich_presence::activity::{self, ActivityType, StatusDisplayType};
use serde::Deserialize;
use std::{
    error::Error,
    fs,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use subsonic::{Song, Subsonic};
use tokio::time::sleep;

const FALLBACK_IMAGE: &str = "https://i.imgur.com/hb3XPzA.png";
type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Deserialize)]
struct Config {
    discord_client_id: String,
    subsonic_username: String,
    subsonic_password: String,
    subsonic_url: String,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn truncate(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn large_image_text(song: &Song) -> String {
    let album = &song.album;
    let count = format!(
        "({} of {})",
        song.track.unwrap_or(1),
        song.total_tracks.unwrap_or(1)
    );

    match song.album_artist.as_deref() {
        Some(artist) if artist != song.artist => format!("{artist} - {album} {count}"),
        _ => format!("{album} {count}"),
    }
}

fn small_image_text(server: &str, song: &Song) -> String {
    let suffix = song.suffix.as_deref().unwrap_or("");
    let bit_rate = song.bit_rate.unwrap_or(0);

    let quality = match suffix {
        "mp3" => format!("| {bit_rate}kbps"),
        "flac" => format!(
            "| {}/{:.1}kHz {bit_rate}kbps",
            song.bit_depth.unwrap_or(0),
            song.sample_rate.unwrap_or(48000) as f64 / 1000.0
        ),
        _ => format!("{suffix} {bit_rate}kbps"),
    };

    format!("{server} | {} {}", suffix.to_uppercase(), quality.trim())
        .trim()
        .to_owned()
}

fn activity(song: &Song, server: &str, start_ms: i64) -> activity::Activity<'static> {
    let assets = activity::Assets::new()
        .large_image(
            song.image_url
                .as_deref()
                .unwrap_or(FALLBACK_IMAGE)
                .to_owned(),
        )
        .large_text(truncate(&large_image_text(song), 128))
        .small_image(FALLBACK_IMAGE)
        .small_text(small_image_text(server, song))
        .small_url("https://github.com/AKarp123/navidrome-rich-presence");

    let mut result = activity::Activity::new()
        .activity_type(ActivityType::Listening)
        .status_display_type(StatusDisplayType::Details)
        .name(server.to_owned())
        .state(format!("{}\u{200b}", truncate(&song.title, 127)))
        .details(format!("{}\u{200b}", truncate(&song.artist, 127)))
        .assets(assets);

    if let Some(duration) = song.duration {
        result = result.timestamps(
            activity::Timestamps::new()
                .start(start_ms)
                .end(start_ms + duration * 1000),
        );
    }

    result
}

async fn run(config: Config) -> Result<()> {
    let api = Subsonic::new(
        config.subsonic_url,
        config.subsonic_username,
        config.subsonic_password,
    )?;

    api.ping().await?;
    let server = "Navidrome";
    println!("Subsonic API is reachable.");

    loop {
        let mut discord = match Discord::connect(&config.discord_client_id) {
            Ok(client) => {
                println!("RPC Client is ready!");
                client
            }
            Err(error) => {
                eprintln!("Unable to connect to Discord: {error}");
                sleep(Duration::from_secs(3)).await;
                continue;
            }
        };

        if let Err(error) = poll(&api, server, &mut discord).await {
            eprintln!("Discord RPC connection lost: {error}");
            sleep(Duration::from_secs(2)).await;
        }
    }
}

async fn poll(api: &Subsonic, server: &str, discord: &mut Discord) -> Result<()> {
    let mut current_id: Option<String> = None;
    let mut start_ms = now_ms();
    let mut cleared = true;

    loop {
        let mut song = match api.now_playing().await {
            Ok(song) => song,
            Err(error) => {
                eprintln!("Error fetching now playing: {error}");
                sleep(Duration::from_millis(2500)).await;
                continue;
            }
        };

        let Some(ref mut song) = song else {
            if !cleared {
                discord.clear_activity()?;
                cleared = true;
                current_id = None;
            }

            sleep(Duration::from_millis(2500)).await;
            continue;
        };

        if matches!(song.state.as_deref(), Some("paused" | "stopped")) {
            if !cleared {
                discord.clear_activity()?;
                cleared = true;
                current_id = None;

                if song.state.as_deref() == Some("paused") {
                    println!("Track is paused.");
                }
            }

            sleep(Duration::from_secs(1)).await;
            continue;
        }

        let mut changed = current_id.as_deref() != Some(song.id.as_str());
        if changed {
            start_ms = now_ms();
        }

        if let Some(position) = song.position_ms {
            if ((now_ms() - start_ms) - position).abs() > 3000 {
                start_ms = now_ms() - position;
                changed = true;
            }
        }

        if song.state.is_none()
            && song
                .duration
                .is_some_and(|duration| now_ms() > start_ms + duration * 1000)
        {
            if !cleared {
                discord.clear_activity()?;
                cleared = true;
            }

            sleep(Duration::from_secs(1)).await;
            continue;
        }

        if changed || (cleared && current_id.is_none()) {
            if let Err(error) = api.enrich(song).await {
                eprintln!("Error fetching album: {error}");
            }

            song.image_url = match api.album_art(song).await {
                Ok(url) => url,
                Err(error) => {
                    eprintln!("Error fetching album art: {error}");
                    None
                }
            };

            discord.set_activity(activity(song, server, start_ms))?;
            println!("Now Playing: {} - {}", song.artist, song.title);
            current_id = Some(song.id.clone());
            cleared = false;
        }

        sleep(Duration::from_secs(1)).await;
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let config: Config = serde_json::from_str(&fs::read_to_string("config.json")?)?;
    run(config).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn formats_activity() {
        let song = Song {
            id: "1".into(),
            title: "A".into(),
            artist: "B".into(),
            album: "C".into(),
            album_id: None,
            duration: Some(60),
            position_ms: None,
            state: None,
            suffix: None,
            bit_rate: None,
            bit_depth: None,
            sample_rate: None,
            track: None,
            album_artist: None,
            total_tracks: None,
            image_url: None,
        };
        let value = serde_json::to_value(activity(&song, "Navidrome", 1_700_000_000_000)).unwrap();
        assert_eq!(value["timestamps"]["end"], 1_700_000_060_000_i64);
        assert_eq!(value["assets"]["large_text"], "C (1 of 1)");
    }
}
