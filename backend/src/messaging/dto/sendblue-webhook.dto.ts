export class SendBlueWebhookDto {
  number: string;
  content: string;
  date_sent: string;
  message_handle: string;
  was_downgraded: boolean;
  from_number?: string;
}
