export class TwilioWebhookDto {
  From: string;
  To: string;
  Body: string;
  SmsMessageSid: string;
  AccountSid: string;
  NumMedia: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  MediaUrl1?: string;
  MediaContentType1?: string;
  [key: string]: string | undefined;
}
