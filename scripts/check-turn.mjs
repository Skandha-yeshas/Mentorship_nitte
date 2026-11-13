import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { mintCloudflareTurnCredentials } from '../server/meetingIce.js';

dotenv.config({ path: new URL('../server/.env', import.meta.url) });
dotenv.config();

const relayCheck = process.argv.includes('--relay');
const provider = (process.env.TURN_PROVIDER || 'none').trim().toLowerCase();
const keyId = (process.env.CLOUDFLARE_TURN_KEY_ID || '').trim();
const token = (process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim();
let browser;
try {
  if (provider !== 'cloudflare' || !keyId || !token) {
    throw new Error('TURN is not activated. Set TURN_PROVIDER=cloudflare, CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN privately in server/.env. See docs/TURN_SETUP.md.');
  }
  if (!relayCheck) {
    console.log('Cloudflare TURN settings are present. Live provider/relay connectivity has not been tested. Run npm run turn:check -- --relay to verify.');
  } else {
    const iceServers = await mintCloudflareTurnCredentials({ keyId, token, ttl: 120 });
    console.log('Provider accepted the key and issued temporary TURN credentials.');
    const { chromium } = await import('playwright');
    const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const executablePath = process.env.TURN_TEST_BROWSER || (existsSync(edge) ? edge : undefined);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    const result = await page.evaluate(async servers => {
      const peer = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: 'relay' });
      const transports = new Set(); let relayCount = 0;
      try {
        return await new Promise(resolve => {
          let finished = false;
          const finish = () => {
            if (finished) return; finished = true; clearTimeout(timeout);
            resolve({ relayCandidates: relayCount, protocols: [...transports] });
          };
          const timeout = setTimeout(finish, 18000);
          peer.onicecandidate = event => {
            if (!event.candidate) { finish(); return; }
            if (event.candidate.type === 'relay') {
              relayCount++; transports.add(event.candidate.relayProtocol || event.candidate.protocol || 'unknown');
              // One candidate proves allocation, but wait briefly for alternate transports.
              if (relayCount === 1) setTimeout(finish, 2000);
            }
          };
          try {
            peer.createDataChannel('relay-check');
            peer.createOffer().then(offer => peer.setLocalDescription(offer)).catch(finish);
          }
          catch { finish(); }
        });
      } finally { peer.close(); }
    }, iceServers);
    if (!result.relayCandidates) throw new Error('No relay candidate was gathered. Check provider activation, credentials and local firewall/network access.');
    console.log(JSON.stringify({ relayAllocationVerified: true, ...result }));
    console.log('Now test a complete RO/student call on two different networks, including audio/video, reconnect, expiry and recording upload.');
  }
} catch (error) {
  console.error(error.status ? 'TURN provider verification failed. Check the private key, provider activation and network access; credentials were not printed.' : error.message);
  process.exitCode = 1;
} finally { await browser?.close(); }
