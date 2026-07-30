import { Agent } from 'https';

/**
 * One shared keep-alive agent for every outbound provider call.
 *
 * WHY: each `axios.post` was opening a fresh TCP + TLS connection. At ~1 turn an
 * hour there is no warm socket to reuse, so every send paid a full handshake —
 * and on 2026-07-30 the first send after a 29-minute idle gap took 6.25s while
 * warm sends took ~400ms (Karibi, "the msg time is still long"). A user's FIRST
 * message of the day is exactly when the product is being judged, so that cold
 * path matters more than the warm one.
 *
 * The typing indicator is the happy accident here: it fires at webhook time,
 * seconds BEFORE the reply is sent, against the same host. Sharing one agent
 * means it pre-warms the very connection the send then reuses.
 *
 * `keepAliveMsecs` is the TCP keep-alive probe interval, not a socket lifetime;
 * idle sockets are held until the peer or `timeout` closes them.
 */
export const keepAliveHttpsAgent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  // Comfortably above our concurrency (bubbles send sequentially), so a burst
  // never has to open an extra connection.
  maxSockets: 20,
  // Hold idle sockets long enough to span a normal conversational gap.
  maxFreeSockets: 10,
  timeout: 60_000,
});
