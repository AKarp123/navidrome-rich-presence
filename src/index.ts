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

let curNowPlaying: NowPlayingEntry & { albumArtist?: string, totalTracks?: number, smallImageUrl?: string, startTime?: number } | undefined;
let nowPlayingID: string | undefined; // This will hold the ID of the currently playing track, if any

const fetchNowPlaying = async () => {
	try {
		const response = await api.getNowPlaying();
		curNowPlaying = response.nowPlaying.entry?.find(entry => entry.username.toLowerCase() === config.subsonic_username.toLowerCase());
		if (curNowPlaying) {
			const album = await api.getAlbum({ id: curNowPlaying.albumId! });
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
	try {
		await api.ping();
		console.log('Subsonic API is reachable.'); //eslint-disable-line no-console
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
			await sleep(5000);
			continue;
		}

		if(Date.now() > curNowPlaying.startTime! + (curNowPlaying.duration! * 1000)) {
			console.log('Track has ended, clearing activity.');
			await client.user?.clearActivity();
			curNowPlaying = undefined;
			nowPlayingID = undefined;
			await sleep(5000);
			continue;
		}


		await fetchAlbumArt().catch(error => {
			console.error('Error fetching album art:', error);
			curNowPlaying!.smallImageUrl = 'https://imgur.com/hb3XPzA';
		});

		console.log(curNowPlaying);

		if(curNowPlaying.id === nowPlayingID) {
			console.warn('Track has not changed, skipping update.');
			await sleep(15000); // Wait for the next update interval
			continue; // If the track hasn't changed, skip updating the activity
		}
		updateActivity(client, {
			type: ActivityType.Listening,
			name: `sfjdsfj`,
			state: `${curNowPlaying.title}`,
			details: curNowPlaying.artist,
			largeImageKey: curNowPlaying.smallImageUrl || 'https://i.imgur.com/hb3XPzA.png',
			largeImageText: `${curNowPlaying.albumArtist !== curNowPlaying.artist ? `${curNowPlaying.albumArtist} - ` : ''}${curNowPlaying.album} (${curNowPlaying.track} of ${curNowPlaying.totalTracks})`,
			smallImageKey: 'https://i.imgur.com/hb3XPzA.png',
			smallImageText: `Navidrome`,
			startTimestamp: Date.now(),
			endTimestamp: Date.now() + (curNowPlaying.duration! * 1000),

		}).then(() => {
			curNowPlaying!.startTime = Date.now();
			nowPlayingID = curNowPlaying!.id; // Update the now playing ID to the current track's ID
		});

		await sleep(15000); // Discord RPC has a 15 second limit for activity updates
	}

	client.destroy();
};

if (require.main === module) { // eslint-disable-line no-undef
	main().catch(console.error);
}
