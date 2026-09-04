import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { createServer, request as httpRequest, type OutgoingHttpHeaders } from 'node:http';
import { BlockList, connect, isIP, type AddressInfo, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';

export interface RunnerEgressPolicy {
  /** Extra origins (for example a CDN or identity provider), configured by the operator. */
  allowedOrigins?: readonly string[];
}

const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['127.0.0.0', 8],
] as const)
  privateAddresses.addSubnet(address, prefix);
privateAddresses.addSubnet('fc00::', 7, 'ipv6');
privateAddresses.addAddress('::1', 'ipv6');
const reserved = new BlockList();
// Conservative exclusions from the IANA special-purpose registries. Private
// ranges are handled separately; metadata/link-local ranges are never allowed.
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['100.64.0.0', 10],
  ['169.254.0.0', 16],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  reserved.addSubnet(address, prefix);
reserved.addAddress('168.63.129.16');
reserved.addAddress('fd00:ec2::254', 'ipv6');
reserved.addSubnet('2001::', 23, 'ipv6');
reserved.addSubnet('2001:db8::', 32, 'ipv6');
reserved.addSubnet('2002::', 16, 'ipv6');
reserved.addSubnet('3fff::', 20, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export const runnerAddressAllowed = (address: string): boolean => {
  const family = isIP(address);
  if (!family) return false;
  const type = family === 4 ? 'ipv4' : 'ipv6';
  if (reserved.check(address, type)) return false;
  if (privateAddresses.check(address, type)) return false;
  return family === 4 || globalV6.check(address, 'ipv6');
};

export const runnerOrigin = (value: string): string => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Runner destinations must be HTTP(S) URLs without embedded credentials.');
  return url.origin;
};

export const parseRunnerOrigins = (value = ''): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const url = new URL(origin);
      if (url.pathname !== '/' || url.search || url.hash || url.hostname.includes('*'))
        throw new Error('Runner allowlists require exact origins, without paths or wildcards.');
      return runnerOrigin(origin);
    });

export class RunnerEgressProxy {
  private readonly allowed: Set<string>;
  private readonly sockets = new Set<Duplex>();
  private closing = false;
  private readonly server = createServer();

  constructor(
    environmentUrl: string,
    policy: RunnerEgressPolicy = {},
    private readonly resolve: (hostname: string) => Promise<LookupAddress[]> = (hostname) =>
      lookup(hostname, { all: true }),
  ) {
    this.allowed = new Set([
      runnerOrigin(environmentUrl),
      ...(policy.allowedOrigins?.map(runnerOrigin) ?? []),
    ]);
  }

  private track<T extends Duplex>(socket: T): T {
    if (this.closing) socket.destroy();
    this.sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.once('close', () => this.sockets.delete(socket));
    return socket;
  }

  async destination(value: string): Promise<{ url: URL; address: string }> {
    const url = new URL(value);
    const origin = runnerOrigin(value);
    if (!this.allowed.has(origin)) throw new Error(`Runner origin is not allowed: ${origin}`);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname) ? [{ address: hostname }] : await this.resolve(hostname);
    if (!addresses.length || addresses.some(({ address }) => !runnerAddressAllowed(address)))
      throw new Error(`Runner address is not allowed: ${origin}`);
    if (this.closing) throw new Error('Runner proxy is closed.');
    return { url, address: addresses[0]!.address };
  }

  async start(): Promise<string> {
    this.server.on('connection', (socket) => this.track(socket));
    this.server.on('request', (request, response) => {
      void (async () => {
        const { url, address } = await this.destination(request.url ?? '');
        if (response.destroyed) return;
        if (url.protocol !== 'http:') throw new Error('HTTPS requires CONNECT.');
        const headers: OutgoingHttpHeaders = { ...request.headers, host: url.host };
        delete headers['proxy-authorization'];
        delete headers['proxy-connection'];
        const upstream = httpRequest(
          {
            hostname: address,
            port: url.port || 80,
            method: request.method,
            path: `${url.pathname}${url.search}`,
            headers,
            agent: false,
          },
          (result) => {
            response.writeHead(result.statusCode ?? 502, result.headers);
            result.pipe(response);
            result.on('error', () => response.destroy());
          },
        );
        upstream.on('socket', (socket) => this.track(socket));
        upstream.setTimeout(30_000, () => upstream.destroy());
        upstream.on('error', () => {
          if (!response.headersSent) response.writeHead(502);
          response.end();
        });
        response.on('close', () => upstream.destroy());
        request.on('error', () => upstream.destroy());
        request.pipe(upstream);
      })().catch(() => {
        if (response.destroyed) return;
        if (response.headersSent) {
          response.destroy();
          return;
        }
        response.writeHead(403, { 'x-testron-egress-denied': '1' });
        response.end('Runner egress denied');
      });
    });
    this.server.on('connect', (request, client, head) => {
      void (async () => {
        // CONNECT only permits the exact HTTPS authority, not arbitrary TCP ports.
        const authority = request.url ?? '';
        const parsed = new URL(`https://${authority}`);
        if (authority !== `${parsed.hostname}:${parsed.port || 443}`)
          throw new Error('Invalid CONNECT authority.');
        const { url, address } = await this.destination(parsed.href);
        if (client.destroyed) return;
        const upstream: Socket = this.track(
          connect({ host: address, port: Number(url.port || 443) }),
        );
        upstream.setTimeout(30_000, () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
        client.on('close', () => upstream.destroy());
        upstream.on('close', () => client.destroy());
        upstream.once('connect', () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          client.pipe(upstream).pipe(client);
        });
      })().catch(() => client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'));
    });
    // Plain-text WebSocket upgrades are unsupported and fail closed. WSS uses
    // the checked HTTPS CONNECT path above.
    this.server.on('upgrade', (_request, socket) => socket.destroy());
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const socket of this.sockets) socket.destroy();
    if (this.server.listening)
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
