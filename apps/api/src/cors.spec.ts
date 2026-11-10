import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { corsOptions, readCorsOrigins } from './cors.js';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class PingModule {}

const WEB = 'https://web.example.test';

async function appWith(value: string | undefined) {
  const app = await NestFactory.create<NestFastifyApplication>(
    PingModule,
    new FastifyAdapter(),
    { logger: false },
  );
  app.enableCors(corsOptions(readCorsOrigins(value).origins));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function get(app: NestFastifyApplication, origin: string) {
  return app.inject({ method: 'GET', url: '/ping', headers: { origin } });
}

describe('CORS', () => {
  it('007 AC-8: a listed origin is allowed', async () => {
    const app = await appWith(WEB);
    const response = await get(app, WEB);
    expect(response.headers['access-control-allow-origin']).toBe(WEB);
    await app.close();
  });

  it('007 AC-8: an origin that is not listed gets no CORS header', async () => {
    const app = await appWith(WEB);
    for (const origin of [
      'https://other.example.test',
      'https://web.example.test.evil.test',
      'http://web.example.test',
      'https://preview-abc.vercel.app',
    ]) {
      const response = await get(app, origin);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
    await app.close();
  });

  it('007 AC-8: with no variable, no origin is allowed', async () => {
    for (const value of [undefined, '', '  ,  ']) {
      const app = await appWith(value);
      const response = await get(app, WEB);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      await app.close();
    }
  });

  it('007 AC-8: several origins can be listed', async () => {
    const app = await appWith(`${WEB}, http://localhost:5173`);
    expect(
      (await get(app, 'http://localhost:5173')).headers[
        'access-control-allow-origin'
      ],
    ).toBe('http://localhost:5173');
    expect((await get(app, WEB)).headers['access-control-allow-origin']).toBe(
      WEB,
    );
    await app.close();
  });

  it('007 AC-8: the preflight allows the methods and the headers of the web app only', async () => {
    const app = await appWith(WEB);
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/ping',
      headers: {
        origin: WEB,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(response.statusCode).toBeLessThan(300);
    const methods = String(response.headers['access-control-allow-methods']);
    expect(methods).toContain('POST');
    expect(methods).not.toMatch(/DELETE|PUT|PATCH/);
    const headers = String(response.headers['access-control-allow-headers']);
    expect(headers.toLowerCase()).toContain('authorization');
    expect(headers.toLowerCase()).toContain('content-type');
    await app.close();
  });

  it('007 AC-8: an entry that is not an exact origin is not allowed', () => {
    const read = readCorsOrigins(
      `${WEB}, *, https://a.example.test/path, ftp://b.example.test, https://*.example.test`,
    );
    expect(read.origins).toEqual([WEB]);
    expect(read.rejected).toHaveLength(4);
  });
});
