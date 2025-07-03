import { Client, type SetActivity } from '@xhayper/discord-rpc';

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

	client.on('disconnected', () => {
		console.log('RPC Client disconnected.');
		process.exit(0);
	});

	client.login();

	return client;
};

const updateActivity = async (client: Client, activity: SetActivity) => {
	client.user?.setActivity(activity)
		.then(() => {
			console.log('Activity updated successfully.');
		})
		.catch(error => {
			console.error('Failed to update activity:', error);
		});
};

const clearActivity = async (client: Client) => {
	client.user?.clearActivity()
		.then(() => {
			console.log('Activity cleared successfully.');
		})
		.catch(error => {
			console.error('Failed to clear activity:', error);
		});
};

export { startRPC, updateActivity, clearActivity };
