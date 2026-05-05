import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class SendBlueWebhookDto {
  @IsString()
  @IsNotEmpty()
  number: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  date_sent?: string;

  @IsOptional()
  @IsString()
  message_handle?: string;

  @IsOptional()
  @IsBoolean()
  was_downgraded?: boolean;

  @IsOptional()
  @IsString()
  from_number?: string;
}
