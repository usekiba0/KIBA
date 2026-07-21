import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';
import { setGlobalDispatcher, Agent as UndiciAgent } from 'undici';

// Render's network stack drops idle keep-alive connections mid-request.
// Disable keep-alive globally for all fetch-based HTTP clients (Anthropic SDK, etc.)
setGlobalDispatcher(new UndiciAgent({ connect: { keepAlive: false, timeout: 30_000 } }));

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Security headers
  app.use(helmet());

  // Trust proxy — required for correct protocol detection behind load balancer / Vercel / AWS ALB
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Required for Twilio webhook signature validation (must be before JSON body parser)
  app.use(express.urlencoded({ extended: false }));

  // CORS — allow production frontend + Vercel preview deployments + local dev
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
  const allowedOrigins = [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      // Allow exact matches
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any Vercel preview deployment for this project
      if (/^https:\/\/kiba-[a-z0-9]+[^.]*\.vercel\.app$/.test(origin))
        return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-key'],
    credentials: true,
  });

  app.setGlobalPrefix('v1');

  // Render and external uptime probes hit `/` — return 200 instead of 404 noise.
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/', (_req: express.Request, res: express.Response) => res.status(200).send('ok'));
  expressApp.head('/', (_req: express.Request, res: express.Response) => res.status(200).end());

  // `/health` probe (Render health check + the `health:check` npm script, which
  // parses JSON and asserts status==='ok'). Lives on the raw express instance so
  // it sits OUTSIDE the v1 global prefix. Without this, the probe 404s every
  // minute and spams ExceptionFilter logs.
  expressApp.get('/health', (_req: express.Request, res: express.Response) => res.status(200).json({ status: 'ok' }));
  expressApp.head('/health', (_req: express.Request, res: express.Response) => res.status(200).end());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const log = new Logger('Bootstrap');
  log.log(`KIBA backend running on port ${port}`);

  // APP_BASE_URL must be THIS service's public URL — it's used to reconstruct
  // the signed URL for Twilio webhook signature validation. Pointing it at the
  // frontend makes every inbound SMS fail with 401, and the failure is silent:
  // outbound still works, so it looks like carriers dropped the replies.
  //
  // Found set to the frontend URL in production on 2026-07-22, where it would
  // have detonated the moment A2P registration cleared — the worst possible
  // time, because it would have read as an A2P problem.
  //
  // Warn rather than throw: a wrong value breaks SMS only, and killing boot
  // would also take down iMessage, which is the primary channel.
  const appBase = (process.env.APP_BASE_URL ?? '').replace(/\/$/, '');
  const frontend = (process.env.FRONTEND_URL ?? '').replace(/\/$/, '');
  if (appBase && frontend && appBase === frontend) {
    log.error(
      `APP_BASE_URL (${appBase}) is the same as FRONTEND_URL. It must be THIS backend's public URL ` +
      '— every inbound Twilio SMS will fail signature validation with 401 until this is fixed.',
    );
  }
}

bootstrap();
