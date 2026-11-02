use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

pub struct Discord(DiscordIpcClient);

impl Discord {
    pub fn connect(client_id: &str) -> Result<Self, discord_rich_presence::error::Error> {
        let mut client = DiscordIpcClient::new(client_id);
        client.connect()?;

        Ok(Self(client))
    }

    pub fn set_activity(
        &mut self,
        activity: activity::Activity<'_>,
    ) -> Result<(), discord_rich_presence::error::Error> {
        self.0.set_activity(activity)
    }

    pub fn clear_activity(&mut self) -> Result<(), discord_rich_presence::error::Error> {
        self.0.clear_activity()
    }
}
