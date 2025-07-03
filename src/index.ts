import { SubsonicAPI, type NowPlayingEntry } from 'subsonic-api';
import { startRPC, updateActivity } from './rpc';
import type { Client } from '@xhayper/discord-rpc';
import { ActivityType } from 'discord-api-types/v9';
import { sleep } from 'bun';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { time } from 'console';

const configPath = join(process.cwd(), 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));

const api = new SubsonicAPI({
	url: config.subsonic_url,
	auth: {
		username: config.subsonic_username,
		password: config.subsonic_password,
	},
});

let curNowPlaying: NowPlayingEntry & { albumArtist?: string, totalTracks?: number, smallImageUrl?: string } | undefined; //eslint-disable-line
let startTime: number | undefined; // This will hold the start time of the currently playing track
let nowPlayingID: string | undefined; // This will hold the ID of the currently playing track, if any

const fetchNowPlaying = async () => {
	try {
		const response = await api.getNowPlaying();
		curNowPlaying = response.nowPlaying.entry?.find(entry => entry.username.toLowerCase() === config.subsonic_username.toLowerCase());
		if (curNowPlaying) {
			const album = await api.getAlbum({ id: curNowPlaying.albumId! });

			if (curNowPlaying.id !== nowPlayingID) {
				startTime = Date.now(); // Set the start time when a new track is detected
			}

			curNowPlaying.albumArtist = album.album.artist;
			curNowPlaying.totalTracks = album.album.songCount;
		}
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

	curNowPlaying.smallImageUrl = albumInfo.smallImageUrl || '';
};

const main = async () => {
	let serverType : string = "";
	try {
		// @ts-ignore - Ignore since type isn't defined for some reason
		const { type } = await api.ping();
		serverType = type;
		console.log('Subsonic API is reachable.'); // eslint-disable-line no-console
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

	while (!client.isConnected) {
		await sleep(1000);
	}

	while (client.isConnected) {
		await fetchNowPlaying().catch(error => {
			console.error('Error fetching now playing:', error);
		});
		if (!curNowPlaying) {
			if (nowPlayingID) {
				console.warn('Clearing activity due to no current track.');
				await client.user?.clearActivity();
				nowPlayingID = undefined;
			}
			await sleep(2500);
			continue;
		}

		if (Date.now() > startTime! + (curNowPlaying.duration! * 1000)) {
			console.log('Track has ended, clearing activity.'); // eslint-disable-line no-console
			await client.user?.clearActivity();
			curNowPlaying = undefined;
			nowPlayingID = undefined;
			continue;
		}
		
		if (curNowPlaying.id === nowPlayingID) {
			continue; // If the track hasn't changed, skip updating the activity
		}
		
		await fetchAlbumArt().catch(error => {
			console.error('Error fetching album art:', error);
			curNowPlaying!.smallImageUrl = 'https://imgur.com/hb3XPzA';
		});


		updateActivity(client, {
			type: ActivityType.Listening,
			name: 'sfjdsfj',
			state: `${curNowPlaying.title}`,
			details: curNowPlaying.artist,
			largeImageKey: curNowPlaying.smallImageUrl || 'https://i.imgur.com/hb3XPzA.png',
			largeImageText: `${curNowPlaying.albumArtist !== curNowPlaying.artist ? `${curNowPlaying.albumArtist} - ` : ''}${curNowPlaying.album} (${curNowPlaying.track} of ${curNowPlaying.totalTracks})`, //eslint-disable-line
			smallImageKey: 'https://i.imgur.com/hb3XPzA.png',
			smallImageText: serverType.charAt(0).toUpperCase() + serverType.slice(1), // Capitalize the first letter of the server type
			startTimestamp: startTime!,
			endTimestamp: startTime! + (curNowPlaying.duration! * 1000),

		}).then(() => {
			console.log('Now Playing: ', curNowPlaying!.artist, ' - ', curNowPlaying!.title); // eslint-disable-line no-console
			nowPlayingID = curNowPlaying!.id; // Update the now playing ID to the current track's ID
		});

		await sleep(5000);
	}

	client.destroy();
};

if (require.main === module) { // eslint-disable-line no-undef
	main().catch(console.error);
}

