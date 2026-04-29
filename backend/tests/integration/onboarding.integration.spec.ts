import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as express from 'express';
import { AppModule } from '../../src/app.module';

describe('Onboarding Integration (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) {
      console.warn('DATABASE_URL or STRIPE_SECRET_KEY not set — skipping onboarding integration tests');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.use(express.urlencoded({ extended: false }));
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /v1/onboarding/setup-intent', () => {
    it('should return a Stripe client_secret', async () => {
      if (!process.env.DATABASE_URL) return;

      const res = await request(app.getHttpServer())
        .post('/v1/onboarding/setup-intent')
        .send({ name: 'Test User', phone_number: '+15551234567' })
        .expect(200);

      expect(res.body.client_secret).toBeTruthy();
      expect(res.body.client_secret).toMatch(/^seti_/);
    }, 15000);

    it('should reject invalid phone number', async () => {
      if (!process.env.DATABASE_URL) return;

      await request(app.getHttpServer())
        .post('/v1/onboarding/setup-intent')
        .send({ name: 'Test', phone_number: 'not-a-phone' })
        .expect(400);
    });

    it('should reject missing name', async () => {
      if (!process.env.DATABASE_URL) return;

      await request(app.getHttpServer())
        .post('/v1/onboarding/setup-intent')
        .send({ phone_number: '+15551234567' })
        .expect(400);
    });
  });

  describe('GET /v1/health', () => {
    it('should return health status', async () => {
      if (!process.env.DATABASE_URL) return;

      const res = await request(app.getHttpServer())
        .get('/v1/health')
        .expect(200);

      expect(res.body.status).toMatch(/ok|degraded/);
      expect(res.body.checks).toBeDefined();
    });
  });

  describe('Data rights endpoints require auth', () => {
    it('should reject data export without internal API key', async () => {
      if (!process.env.DATABASE_URL) return;

      await request(app.getHttpServer())
        .get('/v1/users/00000000-0000-0000-0000-000000000001/export')
        .expect(401);
    });

    it('should reject data deletion without internal API key', async () => {
      if (!process.env.DATABASE_URL) return;

      await request(app.getHttpServer())
        .delete('/v1/users/00000000-0000-0000-0000-000000000001')
        .expect(401);
    });
  });
});
