import { SubsonicAPI, type NowPlayingEntry } from 'subsonic-api';
import { startRPC, updateActivity } from './rpc';
import type { Client } from '@xhayper/discord-rpc';
import { fetch, sleep } from 'bun';
import { readFileSync } from 'fs';
import { join } from 'path';

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
			const { album } = await api.getAlbum({ id: curNowPlaying.albumId! });

			if (curNowPlaying.id !== nowPlayingID) {
				startTime = Date.now(); // Set the start time when a new track is detected
			}

			if (album.song) {
				for (let i = 0; i < album.song.length; i++) {
					if (album.song[i]!.id === curNowPlaying.id) {
						curNowPlaying.track = i + 1;
						break;
					}
				}
			}

			curNowPlaying.albumArtist = album.artist;
			curNowPlaying.totalTracks = album.songCount;
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
	if (!albumInfo || !albumInfo.smallImageUrl) {
		console.warn('No album art found for the current track.');
		curNowPlaying.smallImageUrl = 'https://imgur.com/hb3XPzA.png';
		return;
	}

	const res = await fetch(albumInfo.smallImageUrl).then(res => res.text());
	if (res.indexOf('Artwork not found') !== -1) {
		curNowPlaying.smallImageUrl = 'https://imgur.com/hb3XPzA.png';
		return;
	}

	curNowPlaying.smallImageUrl = albumInfo.smallImageUrl;
};

const main = async () => {
	let serverType : string = '';
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

	let clearedStatus = false;
	while (client.isConnected) {
		await fetchNowPlaying().catch(error => {
			console.error('Error fetching now playing:', error);
		});
		if (!curNowPlaying) {
			if (nowPlayingID && !clearedStatus) {
				console.warn('Clearing activity due to no current track.');
				await client.user?.clearActivity();
				nowPlayingID = undefined;
			}

			await sleep(2500);
			continue;
		}

		if (Date.now() > startTime! + (curNowPlaying.duration! * 1000)) {
			if (clearedStatus) { // If already cleared, continue
				await sleep(1000);
				continue;
			}

			// If the track has ended, clear the activity
			console.log('Track has ended, clearing activity.'); // eslint-disable-line no-console
			await client.user?.clearActivity();
			clearedStatus = true;
			await sleep(1000);
			continue;
		}

		if (curNowPlaying.id === nowPlayingID) {
			await sleep(5000);
			continue; // If the track hasn't changed, skip updating the activity
		}

		await fetchAlbumArt().catch(error => {
			console.error('Error fetching album art:', error);
			curNowPlaying!.smallImageUrl = 'https://imgur.com/hb3XPzA';
		});

		const formattedLargeImageText: string = `${curNowPlaying.albumArtist !== curNowPlaying.artist ? `${curNowPlaying.albumArtist} - ` : ''}${curNowPlaying.album} (${curNowPlaying.track || 1} of ${curNowPlaying.totalTracks || 1})`; //eslint-disable-line
		updateActivity(client, {
			type: 2,
			name: `${(curNowPlaying.artist)!.substring(0, 128)}`,
			state: `${(curNowPlaying.title)!.substring(0, 127)}\u200B`,
			details: `${(curNowPlaying.artist)!.substring(0, 127)}\u200B`,
			largeImageKey: curNowPlaying.smallImageUrl || 'https://i.imgur.com/hb3XPzA.png',
			largeImageText: formattedLargeImageText.substring(0, 128),
			smallImageKey: 'https://i.imgur.com/hb3XPzA.png',
			smallImageText: serverType.charAt(0).toUpperCase() + serverType.slice(1),
			startTimestamp: startTime!,
			endTimestamp: startTime! + (curNowPlaying.duration! * 1000),

		}).then(() => {
			console.log('Now Playing: ', curNowPlaying!.artist, ' - ', curNowPlaying!.title); // eslint-disable-line no-console
			nowPlayingID = curNowPlaying!.id; // Update the now playing ID to the current track's ID
			clearedStatus = false;
		});

		await sleep(5000);
	}

	client.destroy();
};

if (require.main === module) { // eslint-disable-line no-undef
	main().catch(console.error);
}

