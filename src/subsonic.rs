use opensubsonic::{Auth, Client};
use std::{error::Error, time::Duration};

type Result<T> = std::result::Result<T, Box<dyn Error + Send + Sync>>;

pub struct Subsonic {
    api: Client,
    http: reqwest::Client,
    username: String,
}

#[derive(Debug)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_id: Option<String>,
    pub duration: Option<i64>,
    pub position_ms: Option<i64>,
    pub state: Option<String>,
    pub suffix: Option<String>,
    pub bit_rate: Option<i32>,
    pub bit_depth: Option<i32>,
    pub sample_rate: Option<i32>,
    pub track: Option<usize>,
    pub album_artist: Option<String>,
    pub total_tracks: Option<usize>,
    pub image_url: Option<String>,
}

impl Subsonic {
    pub fn new(base: String, username: String, password: String) -> Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()?;

        let api = Client::new(&base, Auth::token(&username, &password))?
            .with_client_name("navidrome-rpc")
            .with_http_client(http.clone());

        Ok(Self {
            api,
            http,
            username,
        })
    }

    pub async fn ping(&self) -> Result<()> {
        self.api.ping().await?;
        Ok(())
    }

    pub async fn now_playing(&self) -> Result<Option<Song>> {
        let entries = self.api.get_now_playing().await?;

        Ok(entries
            .into_iter()
            .find(|entry| {
                entry
                    .username
                    .as_deref()
                    .is_some_and(|user| user.eq_ignore_ascii_case(&self.username))
            })
            .map(|entry| {
                let child = entry.child;

                Song {
                    id: child.id,
                    title: child.title,
                    artist: child.artist.unwrap_or_default(),
                    album: child.album.unwrap_or_default(),
                    album_id: child.album_id,
                    duration: child.duration,
                    position_ms: entry.position_ms,
                    state: entry.state,
                    suffix: child.suffix,
                    bit_rate: child.bit_rate,
                    bit_depth: child.bit_depth,
                    sample_rate: child.sampling_rate,
                    track: child.track.and_then(|n| usize::try_from(n).ok()),
                    album_artist: None,
                    total_tracks: None,
                    image_url: None,
                }
            }))
    }

    pub async fn enrich(&self, song: &mut Song) -> Result<()> {
        let Some(id) = song.album_id.as_deref() else {
            return Ok(());
        };

        let album = self.api.get_album(id).await?;
        song.album_artist = album.artist;
        song.total_tracks = album.song_count.and_then(|n| usize::try_from(n).ok());

        if let Some((index, item)) = album
            .song
            .iter()
            .enumerate()
            .find(|(_, item)| item.id == song.id)
        {
            song.track = Some(index + 1);
            song.suffix.clone_from(&item.suffix);
            song.bit_rate = item.bit_rate;
            song.bit_depth = item.bit_depth;
            song.sample_rate = item.sampling_rate;
        }

        Ok(())
    }

    pub async fn album_art(&self, song: &Song) -> Result<Option<String>> {
        let Some(id) = song.album_id.as_deref() else {
            return Ok(None);
        };

        let info = self.api.get_album_info(id).await?;
        let Some(url) = info.small_image_url else {
            return Ok(None);
        };

        let body = self
            .http
            .get(&url)
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;

        Ok((!body.contains("Artwork not found")).then_some(url))
    }
}
