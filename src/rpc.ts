import {Client, type SetActivity} from '@xhayper/discord-rpc';
import {sleep} from 'bun';

const startRPC = (discord_client_id: string) : Client => {
	const client = new Client({
		clientId: discord_client_id,

	});

	client.on('ready', () => {
		console.log('RPC Client is ready!');
	});

	client.on('ERROR', error => {
		console.error('RPC Client Error:', error);
		throw Error('Failed to start RPC Client');
	});

	client.login();

	return client;
};

const updateActivity = async (client: Client, activity: SetActivity) => {
	while (!client.isConnected) {
		await sleep(1000);
	}

	try {
		await client.user?.setActivity(activity);
		console.log('Activity updated successfully.');
	} catch (error) {
		console.error('Failed to update activity:', error);
	}
};

export {startRPC, updateActivity};
