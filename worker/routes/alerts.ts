import { routes, poller } from '../app';

// --- Alert history ---------------------------------------------------------------------

const app = routes().get('/api/alerts', async (c) =>
	c.json(await poller(c.env, c.get('user').id).alerts())
);

export default app;
