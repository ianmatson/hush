import { execFileSync } from 'node:child_process';
import net from 'node:net';

const DEV_SERVER = { host: '127.0.0.1', port: 5173 };
const TAILSCALE_CLIS = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

function tailnetAddress() {
	for (const cli of TAILSCALE_CLIS) {
		try {
			const [ipv4] = execFileSync(cli, ['ip', '-4'], { encoding: 'utf8' }).trim().split('\n');
			if (ipv4) return ipv4;
		} catch {
			continue;
		}
	}
	throw new Error('No tailnet address: install Tailscale and connect it.');
}

function forwardToDevServer(client) {
	const devServer = net.connect(DEV_SERVER);
	const closeBoth = () => {
		client.destroy();
		devServer.destroy();
	};
	client.on('error', closeBoth);
	devServer.on('error', closeBoth);
	client.pipe(devServer).pipe(client);
}

const address = tailnetAddress();
net
	.createServer(forwardToDevServer)
	.listen(DEV_SERVER.port, address, () =>
		console.log(`The dev server is on the tailnet at http://${address}:${DEV_SERVER.port}`)
	);
