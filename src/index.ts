import config from './config';
import { SubsonicAPI, type NowPlayingEntry } from 'subsonic-api';
import { startRPC, updateActivity } from './rpc';
import type { Client } from '@xhayper/discord-rpc';
import { ActivityType } from 'discord-api-types/v9';
import { sleep } from 'bun';

const api = new SubsonicAPI({
	url: config.subsonic_url,
	auth: {
		username: config.subsonic_username,
		password: config.subsonic_password,
	},
});

let curNowPlaying: NowPlayingEntry & { smallImageUrl? : string} | undefined;

const fetchNowPlaying = async () => {
	try {
		const response = await api.getNowPlaying();
		curNowPlaying = response.nowPlaying.entry?.find(entry => entry.username === config.subsonic_username);
	} catch (error) {
		console.error('Error fetching now playing:', error);
		throw error;
	}
};

const fetchAlbumArt = async () => {
	if (!curNowPlaying || curNowPlaying.albumId === undefined) {
		console.warn('No currently playing track to fetch album art for.');
		return '';
	}

	const { albumInfo } = await api.getAlbumInfo({
		id: curNowPlaying.albumId,
	});

	return albumInfo?.smallImageUrl || '';
};

const main = async () => {
	try {
		await api.ping();
		console.log('Subsonic API is reachable.');
	} catch (error) {
		console.error('Failed to reach Subsonic API:', error);
		return;
	}

	let client : Client | undefined;
	try {
		client = startRPC(config.discord_client_id);
	} catch (error) {
		console.error('Error starting RPC:', error);
		return;
	}

	updateActivity(client, {

		details: 'Listening to music',
		state: 'Fetching now playing...',
		type: ActivityType.Listening,
	});

	while (!client.isConnected) {
		await sleep(1000);
	}

	await sleep(5000);
	client.destroy();
};

if (require.main === module) { // eslint-disable-line no-undef
	main().catch(console.error);
}
