import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
  readonly body: string;
}

export type FakeHandler = (request: RecordedRequest, response: ServerResponse) => void;

export interface FakeUpstream {
  readonly url: string;
  readonly requests: RecordedRequest[];
  close(): Promise<void>;
}

/** Servidor HTTP real em porta efêmera, que grava o que recebe e responde como o handler mandar. */
export async function startFakeUpstream(handler: FakeHandler): Promise<FakeUpstream> {
  const requests: RecordedRequest[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const recorded = {
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      };
      requests.push(recorded);
      handler(recorded, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}

export function sendJson(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

/** URL de uma porta em que nada escuta: simula o serviço fora do ar. */
export async function deadUrl(): Promise<string> {
  const upstream = await startFakeUpstream(() => undefined);
  const { url } = upstream;
  await upstream.close();
  return url;
}
