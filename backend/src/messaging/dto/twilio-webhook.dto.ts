import { IsString, IsOptional } from 'class-validator';

export class TwilioWebhookDto {
  @IsString() From: string;
  @IsString() To: string;
  @IsOptional() @IsString() Body?: string;
  @IsOptional() @IsString() SmsMessageSid?: string;
  @IsOptional() @IsString() MessageSid?: string;
  @IsOptional() @IsString() SmsSid?: string;
  @IsOptional() @IsString() AccountSid?: string;
  @IsOptional() @IsString() NumMedia?: string;
  @IsOptional() @IsString() NumSegments?: string;
  @IsOptional() @IsString() SmsStatus?: string;
  @IsOptional() @IsString() MessageStatus?: string;
  @IsOptional() @IsString() ApiVersion?: string;
  @IsOptional() @IsString() MessagingServiceSid?: string;
  @IsOptional() @IsString() MediaUrl0?: string;
  @IsOptional() @IsString() MediaContentType0?: string;
  @IsOptional() @IsString() MediaUrl1?: string;
  @IsOptional() @IsString() MediaContentType1?: string;
  @IsOptional() @IsString() FromCity?: string;
  @IsOptional() @IsString() FromState?: string;
  @IsOptional() @IsString() FromZip?: string;
  @IsOptional() @IsString() FromCountry?: string;
  @IsOptional() @IsString() ToCity?: string;
  @IsOptional() @IsString() ToState?: string;
  @IsOptional() @IsString() ToZip?: string;
  @IsOptional() @IsString() ToCountry?: string;

  [key: string]: string | undefined;
}
