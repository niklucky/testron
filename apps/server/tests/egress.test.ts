import { createServer, request } from 'node:http';
import type * as Http from 'node:http';
import type * as Net from 'node:net';
import { connect, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RunnerEgressProxy,
  parseRunnerOrigins,
  runnerAddressAllowed,
} from '../src/test-runs/egress.js';

vi.mock('node:http', async (original) => ({
  ...(await original<typeof Http>()),
  request: vi.fn(),
}));
vi.mock('node:net', async (original) => ({
  ...(await original<typeof Net>()),
  connect: vi.fn(),
}));
const http = await vi.importActual<typeof Http>('node:http');
const net = await vi.importActual<typeof Net>('node:net');
afterEach(() => vi.resetAllMocks());

const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
const get = (proxy: string, destination: string) =>
  new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      proxy,
      { path: destination, headers: { host: 'spoofed.test', 'proxy-authorization': 'secret' } },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode!, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });

describe('runner egress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '0.0.0.0',
    '169.254.169.254',
    '100.100.100.200',
    '168.63.129.16',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:a00:1',
    'fd00::1',
    'fd00:ec2::254',
    'fe80::1',
    'ff02::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '64:ff9b::7f00:1',
    'not-an-ip',
  ])('blocks non-public address %s', (address) => {
    expect(runnerAddressAllowed(address)).toBe(false);
  });

  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])(
    'permits public address %s',
    (address) => {
      expect(runnerAddressAllowed(address)).toBe(true);
    },
  );

  it('accepts only exact HTTP(S) origins in operator configuration', () => {
    expect(parseRunnerOrigins(' https://cdn.example.com,https://login.example.com:443 ')).toEqual([
      'https://cdn.example.com',
      'https://login.example.com',
    ]);
    for (const value of [
      'file:///tmp',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com?x=1',
      'https://*.example.com',
      '*',
    ])
      expect(() => parseRunnerOrigins(value)).toThrow();
  });

  it('blocks unapproved origins, mixed DNS results, rebinding and numeric loopback aliases', async () => {
    const resolve = vi.fn(publicDns);
    const proxy = new RunnerEgressProxy(
      'https://app.example.com',
      { allowedOrigins: ['https://cdn.example.com', 'http://127.0.0.1'] },
      resolve,
    );
    await expect(proxy.destination('https://app.example.com/page')).resolves.toMatchObject({
      address: '93.184.216.34',
    });
    await expect(proxy.destination('https://cdn.example.com/file')).resolves.toMatchObject({
      address: '93.184.216.34',
    });
    await expect(proxy.destination('https://other.example.com')).rejects.toThrow('origin');
    resolve.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    await expect(proxy.destination('https://app.example.com')).rejects.toThrow('address');
    resolve.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(proxy.destination('https://app.example.com')).rejects.toThrow('address');
    for (const url of ['http://2130706433', 'http://0x7f000001', 'http://127.1'])
      await expect(proxy.destination(url)).rejects.toThrow('address');
    await proxy.close();
    await expect(proxy.destination('https://app.example.com')).rejects.toThrow('closed');
  });

  it('pins HTTP connections to checked DNS addresses and overwrites Host', async () => {
    const upstream = createServer((req, res) => {
      expect(req.headers.host).toBe('app.example.com');
      expect(req.headers['proxy-authorization']).toBeUndefined();
      res.end('public fixture');
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    vi.mocked(request).mockImplementation(((
      options: Http.RequestOptions,
      callback: Parameters<typeof request>[1],
    ) => {
      expect(options.hostname).toBe('93.184.216.34');
      // Test-only transport mapping: the production proxy still selects and
      // passes the validated public IP, never the hostname for a second lookup.
      return http.request(
        { ...options, hostname: '127.0.0.1', port: (upstream.address() as AddressInfo).port },
        callback as never,
      );
    }) as typeof request);
    const proxy = new RunnerEgressProxy('http://app.example.com', {}, publicDns);
    try {
      const url = await proxy.start();
      expect(await get(url, 'http://app.example.com/page')).toEqual({
        status: 200,
        body: 'public fixture',
      });
      expect(await get(url, 'http://169.254.169.254/')).toMatchObject({ status: 403 });
      expect(request).toHaveBeenCalledOnce();
    } finally {
      await proxy.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });

  it('pins HTTPS CONNECT tunnels and refuses private and unapproved destinations', async () => {
    const upstream = net.createServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    vi.mocked(connect).mockImplementation(((options: { host: string }) => {
      expect(options.host).toBe('93.184.216.34');
      return net.connect({ host: '127.0.0.1', port: (upstream.address() as AddressInfo).port });
    }) as unknown as typeof connect);
    const proxy = new RunnerEgressProxy(
      'https://app.example.com',
      { allowedOrigins: ['https://127.0.0.1'] },
      publicDns,
    );
    const tunnel = (proxyUrl: string, authority: string) =>
      new Promise<string>((resolve, reject) => {
        const url = new URL(proxyUrl);
        const socket = net.connect({ host: url.hostname, port: Number(url.port) });
        socket.on('error', reject);
        socket.on('connect', () =>
          socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`),
        );
        socket.once('data', (data) => {
          socket.destroy();
          resolve(data.toString());
        });
      });
    try {
      const url = await proxy.start();
      expect(await tunnel(url, 'app.example.com:443')).toContain('200 Connection Established');
      expect(await tunnel(url, '127.0.0.1:443')).toContain('403');
      expect(await tunnel(url, 'other.example.com:443')).toContain('403');
      expect(connect).toHaveBeenCalledOnce();
    } finally {
      await proxy.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});
