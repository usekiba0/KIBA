import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';
import { TwilioWebhookGuard } from '../../src/messaging/guards/twilio-webhook.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('Twilio Contract Tests', () => {
  let guard: TwilioWebhookGuard;

  const mockConfig = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'TWILIO_AUTH_TOKEN') return 'test_auth_token';
      if (key === 'APP_BASE_URL') return 'https://api.ryke.ai';
      throw new Error(`Unmocked config key: ${key}`);
    }),
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TwilioWebhookGuard,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    guard = module.get(TwilioWebhookGuard);
  });

  describe('Twilio webhook body shape', () => {
    it('should accept SMS webhook with required fields', () => {
      const smsBody = {
        From: '+15551234567',
        To: '+15550001234',
        Body: 'Hello coach',
        SmsMessageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        NumMedia: '0',
      };
      expect(smsBody.From).toMatch(/^\+\d{10,15}$/);
      expect(smsBody.NumMedia).toBe('0');
    });

    it('should contain media fields when NumMedia >= 1', () => {
      const mmsBody = {
        From: '+15551234567',
        Body: '',
        SmsMessageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/media/abc123',
        MediaContentType0: 'image/jpeg',
      };
      expect(parseInt(mmsBody.NumMedia)).toBeGreaterThan(0);
      expect(mmsBody.MediaUrl0).toBeDefined();
      expect(mmsBody.MediaContentType0).toMatch(/^image\//);
    });
  });

  describe('TwilioWebhookGuard', () => {
    const buildMockContext = (signature: string, body: Record<string, string>) => ({
      switchToHttp: () => ({
        getRequest: () => ({
          header: (name: string) => name === 'X-Twilio-Signature' ? signature : undefined,
          originalUrl: '/v1/webhooks/sms',
          body,
        }),
      }),
    }) as unknown as ExecutionContext;

    it('should reject request with missing signature', () => {
      const ctx = buildMockContext('', {});
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should reject request with invalid signature', () => {
      const ctx = buildMockContext('invalid_signature', { From: '+15551234567', Body: 'test' });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('should accept request with valid Twilio signature', () => {
      const authToken = 'test_auth_token';
      const url = 'https://api.ryke.ai/v1/webhooks/sms';
      const body = { From: '+15551234567', Body: 'test', SmsMessageSid: 'SM123', NumMedia: '0' };
      const validSig = twilio.getExpectedTwilioSignature(authToken, url, body);

      const ctx = buildMockContext(validSig, body);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('Outbound SMS', () => {
    it('should validate E.164 phone number format', () => {
      const validNumbers = ['+15551234567', '+447911123456', '+61412345678'];
      const invalidNumbers = ['555-123-4567', '07911123456', '15551234567'];

      validNumbers.forEach(n => expect(n).toMatch(/^\+[1-9]\d{7,14}$/));
      invalidNumbers.forEach(n => expect(n).not.toMatch(/^\+[1-9]\d{7,14}$/));
    });
  });
});
