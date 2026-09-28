import type { IncomingMessage, ServerResponse } from 'node:http';

export function createApi(options: { dataDir: string }): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
