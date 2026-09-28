import type { IncomingMessage, ServerResponse } from 'node:http';

export function createApi(options: {
  dataDir: string;
  password?: string;
}): (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
