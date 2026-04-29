# Contract: Twilio Inbound Webhook

**Direction**: Twilio → RYKE AI Backend  
**Endpoint**: `POST /webhooks/sms`  
**Trigger**: Every inbound SMS or MMS sent to the RYKE AI Twilio number

---

## Security

- **Header**: `X-Twilio-Signature` (HMAC-SHA1 of URL + sorted POST params, signed with TWILIO_AUTH_TOKEN)
- **Validation**: `twilio.validateRequest(authToken, signature, fullUrl, body)` in `TwilioWebhookGuard`
- **On failure**: Return HTTP 401 — do not process message

## Request

Content-Type: `application/x-www-form-urlencoded`

### SMS Fields

| Field | Type | Example |
|-------|------|---------|
| `From` | string (E.164) | `+15551234567` |
| `To` | string (E.164) | `+18005550001` |
| `Body` | string | `I want to work on fitness` |
| `SmsMessageSid` | string | `SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `AccountSid` | string | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `NumMedia` | string | `"0"` |
| `FromCountry` | string | `"US"` |

### Additional MMS Fields (when NumMedia ≥ 1)

| Field | Type | Example |
|-------|------|---------|
| `NumMedia` | string | `"1"` |
| `MediaUrl0` | string | `https://api.twilio.com/media/...` |
| `MediaContentType0` | string | `image/jpeg` |
| `MediaUrl1` | string | (if multiple attachments) |
| `MediaContentType1` | string | |

## Response Contract

- **Status**: HTTP 200
- **Content-Type**: `text/xml`
- **Body**: Empty string `""` (coach response sent separately via outbound API)
- **Timing**: Must respond within **100ms** (Twilio 15s timeout; queue all processing)

## Processing Flow (Async — after response sent)

```
1. Validate Twilio signature (sync, in Guard)
2. Parse From, Body, NumMedia, MediaUrl0
3. Store message to PostgreSQL (idempotent on SmsMessageSid)
4. Respond to Twilio with empty 200
5. → BullMQ: coaching queue
     a. Check user registration (unregistered → prompt to sign up)
     b. Check crisis_hold status (true → send holding message, skip AI)
     c. Classify for crisis (BullMQ: crisis-detection queue, async)
     d. If MMS + food image → BullMQ: vision queue
     e. Load session from Redis (or PostgreSQL fallback)
     f. Call Claude coaching API
     g. Send outbound SMS via Messaging Layer
     h. Persist message to PostgreSQL + update Redis
```

## Idempotency

- `SmsMessageSid` is stored as UNIQUE on `messages.twilio_sid`
- On duplicate webhook (Twilio retry): INSERT returns conflict → skip processing, return 200

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Unregistered sender | Send "Please sign up at ryke.ai to get started." |
| User on crisis hold | Send holding message variant; do not process through AI |
| Claude API unavailable | Send "I'm having a moment — I'll respond shortly." Queue retry |
| MMS image unreadable | Send "I couldn't identify a meal in that photo. Try a clearer shot?" |
| Twilio signature invalid | HTTP 401; log security alert |
