import config from "./config";
import { SubsonicAPI  } from "subsonic-api";
import { startRPC, updateActivity,  } from "./rpc";
import type { Client,  } from "@xhayper/discord-rpc";
import { ActivityType } from "discord-api-types/v9"
import { sleep } from "bun";



const api = new SubsonicAPI({
    url: config.subsonic_url,
    auth: {
        username: config.subsonic_username,
        password: config.subsonic_password
    }
})

const fetchNowPlaying = async () => {
    try {
        const response = await api.getNowPlaying();
        return response;
    } catch (error) {
        console.error("Error fetching now playing:", error);
        throw error;
    }
}


const main = async () => {
    try {
        await api.ping();
        console.log("Subsonic API is reachable.");

    } catch (error) {
        console.error("Failed to reach Subsonic API:", error);
        return;
    }

    // setInterval(async () => {
    //     fetchNowPlaying().then((response) => {
    //         if (response.nowPlaying.entry && response.nowPlaying.entry.length > 0) {
    //             let userNowPlaying = response.nowPlaying.entry.filter((entry) => entry.username.toLowerCase() === config.subsonic_username.toLowerCase())[0];
    //             if (userNowPlaying) {
    //                 console.log(`Now Playing: ${userNowPlaying.title} by ${userNowPlaying.artist} (${userNowPlaying.album})`);
    //             }
    //         }
    //         else {
    //             console.log("No current track playing for the user.");
    //         }
    //     })
    // }, 1000);
    let client : Client | undefined = undefined;
    try{
        client = startRPC("1389756106213163038");
    }catch (error) {
        console.error("Error starting RPC:", error);
        return;
    }

    updateActivity(client, {
        details: "Listening to music",
        state: "Fetching now playing...",
        type: ActivityType.Listening
    });

    await sleep(5000)
    client.destroy();
}

if(require.main === module) {
    main().catch(console.error);
}