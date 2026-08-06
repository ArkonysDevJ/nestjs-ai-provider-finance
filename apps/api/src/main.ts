// src/main.ts
// [F-ID: SRC-MAIN-01]
// @version 1.1.0
// @changelog 1.1.0 — Removed credentials: true from CORS config. Found
//            during a security audit pass: this project's frontend never
//            uses cookies (auth.guard.ts validates a Bearer token, and
//            lib/api.ts attaches it explicitly on every request via
//            supabase.auth.getSession() -- session lives in localStorage,
//            not cookies). credentials: true only matters for cookie/HTTP-
//            auth cross-origin requests, so it was dead config left over
//            from bootstrap, not a deliberate choice. origin: true stays --
//            the public demo frontend does need to be reachable from a
//            different origin (Vercel) than the API (Railway).
// @changelog 1.0.0 — Bootstrap Fastify + open CORS for the public demo
//            (the frontend consumes it from a different origin in deploy).

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors({
    origin: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('v1');

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
