import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.MEETING_TEST_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(r => r.ok).catch(() => false);

test('WebRTC waits for relay settings, reuses them on reconnect, and never writes credentials to browser storage/signaling', {
  skip: !available, timeout: 20000
}, async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = []; const signals = [];
  page.on('pageerror', error => errors.push(error.message));
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.addInitScript(() => {
    window.tailwind = {};
    window.configurations = []; window.statuses = []; window.ended = 0;
    window.RTCPeerConnection = class {
      constructor(config) { window.configurations.push(config); this.connectionState='new'; this.signalingState='stable'; }
      addTransceiver() {} getSenders() { return []; } close() {}
    };
  });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') signals.push(route.request().postDataJSON());
    return route.fulfill({ json: {} });
  });
  await page.route('**/api/meetings/ISS-FIXTURE/ice', async route => {
    await gate;
    await route.fulfill({ json: { turnEnabled:true, iceTransportPolicy:'relay', now:Date.now(),
      meeting:{endsAt:new Date(Date.now()+1800000).toISOString()},
      iceServers:[{urls:['turn:relay.example:3478?transport=udp','turns:relay.example:443?transport=tcp'],username:'short-user',credential:'short-secret'}] } });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType:'text/javascript', body:`
    import { WebRtcMeetingSession } from '/src/utils/webrtcService.js';
    window.session = new WebRtcMeetingSession({ issueId:'ISS-FIXTURE',role:'ro',localStream:new MediaStream(),
      onPeerStatus: status => window.statuses.push(status), onMeetingEnded: () => window.ended++ });
    window.constructed = true;
  ` }));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.constructed);
  assert.equal(await page.evaluate(() => window.configurations.length),0);
  release(); await page.evaluate(() => window.session.ready);
  const settings = await page.evaluate(() => window.configurations[0]);
  assert.equal(settings.iceTransportPolicy,'relay');
  assert.equal(settings.iceServers[0].credential,'short-secret');
  await page.evaluate(() => { window.session.resetPeerConnection(); window.session.close(); });
  assert.deepEqual(await page.evaluate(() => window.configurations[1]),settings);
  assert.ok(!JSON.stringify(signals).includes('short-secret'));
  assert.ok(!await page.evaluate(() => JSON.stringify(localStorage).includes('short-secret')));
  assert.deepEqual(errors,[]);
});

test('relay startup cancellation and provider failure do not leave a new peer connection running', {
  skip: !available, timeout:20000
}, async t => {
  const browser = await chromium.launch({ executablePath, headless:true }); t.after(() => browser.close());
  for (const mode of ['cancel','failure','ended']) {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.tailwind = {};
      window.peers=0; window.statuses=[]; window.ended=0;
      window.RTCPeerConnection=class { constructor() { window.peers++; } };
    });
    let release; const gate=new Promise(resolve => { release=resolve; });
    await page.route('https://**/*',route => route.abort());
    await page.route('**/api/**',route => route.fulfill({json:{}}));
    await page.route('**/api/meetings/ISS-FIXTURE/ice',async route => {
      if(mode==='cancel') await gate;
      await route.fulfill({status:mode==='ended'?409:503,json:{error:'Fixture relay unavailable',code:mode==='ended'?'MEETING_ENDED':'TURN_UNAVAILABLE'}}).catch(() => {});
    });
    await page.route(/\/src\/main\.jsx(?:\?.*)?$/,route => route.fulfill({contentType:'text/javascript',body:`
      import { WebRtcMeetingSession } from '/src/utils/webrtcService.js';
      window.session=new WebRtcMeetingSession({issueId:'ISS-FIXTURE',role:'student',localStream:new MediaStream(),
        onPeerStatus: status => window.statuses.push(status),onMeetingEnded:()=>window.ended++});
      window.constructed=true;
    `}));
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.constructed);
    if(mode==='cancel') { await page.evaluate(() => window.session.close()); release(); }
    await page.evaluate(() => window.session.ready);
    assert.equal(await page.evaluate(() => window.peers),0);
    assert.equal(await page.evaluate(() => window.session.isClosed),true);
    if(mode==='failure') assert.equal(await page.evaluate(() => window.statuses[0].error),'Fixture relay unavailable');
    assert.equal(await page.evaluate(() => window.ended),mode==='ended'?1:0);
    await page.close();
  }
});
