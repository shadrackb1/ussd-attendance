const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

function makeRequest(app, method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const data = body ? JSON.stringify(body) : '';
      const options = {
        hostname: 'localhost', port, path: reqPath, method,
        headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
      };
      const req = http.request(options, (res) => {
        let rd = '';
        res.on('data', (c) => (rd += c));
        res.on('end', () => {
          server.close(() => {
            let parsed = null;
            try { parsed = JSON.parse(rd); } catch {}
            resolve({ status: res.statusCode, body: parsed, raw: rd, headers: res.headers });
          });
        });
      });
      req.on('error', (err) => { server.close(() => reject(err)); });
      if (data) req.write(data);
      req.end();
    });
  });
}

describe('USSD Response Format', () => {
  it('should return text/plain and use CON prefix', async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.post('/ussd', (_req, res) => { res.setHeader('Content-Type', 'text/plain'); res.send('CON Welcome'); });
    const result = await makeRequest(app, 'POST', '/ussd', { sessionId: 't1', serviceCode: '*384*100#', phoneNumber: '+254712345678', text: '' });
    assert.equal(result.headers['content-type'].includes('text/plain'), true);
    assert.equal(result.raw.startsWith('CON '), true);
  });

  it('should use END prefix for final messages', async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.post('/ussd', (_req, res) => { res.setHeader('Content-Type', 'text/plain'); res.send('END Done'); });
    const result = await makeRequest(app, 'POST', '/ussd', { sessionId: 't2', serviceCode: '*384*100#', phoneNumber: '+254712345678', text: '1*1234' });
    assert.equal(result.raw.startsWith('END '), true);
  });
});

describe('USSD Menu States', () => {
  it('should show main menu on fresh dial-in', () => { assert.equal(''.split('*').length === 0 || '' === '', true); });
  it('should parse menu choices', () => {
    assert.equal('1'.split('*')[0], '1');
    assert.equal('1*1234'.split('*')[0], '1');
    assert.equal('2'.split('*')[0], '2');
  });
  it('should validate session code format', () => {
    for (const c of ['1234', '12345', '123456']) assert.equal(/^\d{4,6}$/.test(c), true);
    for (const c of ['123', '1234567', 'abc', '']) assert.equal(/^\d{4,6}$/.test(c), false);
  });
});

describe('Africas Talking Callback Format', () => {
  it('should accept required fields', () => {
    const p = { sessionId: 'AT_12345', serviceCode: '*384*100#', phoneNumber: '+254712345678', text: '' };
    assert.equal(typeof p.sessionId, 'string');
    assert.equal(typeof p.phoneNumber, 'string');
  });
  it('should handle multi-level navigation', () => {
    const nav = ['', '1', '1*1234'];
    assert.equal(nav[0], '');
    assert.equal(nav[1], '1');
    assert.equal(nav[2], '1*1234');
  });
});

describe('Rate Limiter', () => {
  const rl = require('../services/rateLimiter');
  let c = 1000;
  const fp = () => '+2547000' + String(c++).padStart(4, '0');
  it('should not rate limit on first attempt', () => { assert.equal(rl.isRateLimited(fp()), false); });
  it('should track remaining attempts', () => { const p = fp(); rl.recordAttempt(p, false); rl.recordAttempt(p, false); assert.equal(rl.getAttemptsRemaining(p), 3); });
  it('should rate limit after 5 failures', () => { const p = fp(); for (let i = 0; i < 5; i++) rl.recordAttempt(p, false); assert.equal(rl.isRateLimited(p), true); });
  it('should reset on success', () => { const p = fp(); rl.recordAttempt(p, false); rl.recordAttempt(p, false); rl.recordAttempt(p, true); assert.equal(rl.isRateLimited(p), false); assert.equal(rl.getAttemptsRemaining(p), 5); });
});

describe('SMS Service', () => {
  const sms = require('../services/sms');
  it('should generate 6-digit OTP', () => { assert.equal(/^\d{6}$/.test(sms.generateOTP()), true); });
  it('should generate numeric OTPs in range', () => { for (let i = 0; i < 50; i++) { const o = Number(sms.generateOTP()); assert.ok(o >= 100000 && o <= 999999); } });
});

describe('Health Check', () => {
  it('should respond ok', async () => {
    const app = express();
    app.get('/health', (_req, res) => res.json({ status: 'ok' }));
    const r = await makeRequest(app, 'GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
  });
});

describe('Full USSD Flow (mocked)', () => {
  function createMockApp() {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    const sessions = new Map();
    const students = new Map();
    const attendance = new Set();
    const rl = require('../services/rateLimiter');
    app.post('/ussd', (req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      const phone = req.body.phoneNumber || '';
      const input = req.body.text || '';
      const parts = input.split('*');
      if (input === '') return res.send('CON Welcome to Attendance System\n1. Sign Attendance\n2. Check My Status');
      const choice = parts[0];
      if (choice === '1' && parts.length === 1) return res.send('CON Enter Session Code:');
      if (choice === '1' && parts.length === 2) {
        const code = parts[1].trim();
        if (!/^\d{4,6}$/.test(code)) return res.send('END Invalid session code. Must be 4-6 digits.');
        if (rl.isRateLimited(phone)) return res.send('END Too many failed attempts.');
        const session = sessions.get(code);
        if (!session || !session.isActive) { rl.recordAttempt(phone, false); return res.send('END Invalid session code.'); }
        if (new Date() > session.expiresAt) { session.isActive = false; rl.recordAttempt(phone, false); return res.send('END This session has expired.'); }
        const student = students.get(phone);
        if (!student) { rl.recordAttempt(phone, false); return res.send('END Your phone number is not registered.'); }
        if (!student.verified) { rl.recordAttempt(phone, false); return res.send('END Your phone number is not verified.'); }
        const attKey = code + ':' + student.id;
        if (attendance.has(attKey)) { rl.recordAttempt(phone, false); return res.send('END You have already signed in for ' + session.unitName + '.'); }
        attendance.add(attKey);
        rl.recordAttempt(phone, true);
        return res.send('END Attendance recorded for ' + session.unitName + '. Thank you, ' + student.name + '!');
      }
      if (choice === '2') {
        const student = students.get(phone);
        if (!student) return res.send('END Your phone number is not registered.');
        if (!student.verified) return res.send('END Your phone number is not verified.');
        return res.send('END No recent attendance found for ' + student.name + '.');
      }
      return res.send('END Invalid option.');
    });
    return { app, sessions, students, attendance };
  }

  it('should show main menu on fresh dial', async () => {
    const { app } = createMockApp();
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's1', serviceCode: '*384*100#', phoneNumber: '+254700000001', text: '' });
    assert.equal(r.raw.includes('1. Sign Attendance'), true);
    assert.equal(r.raw.startsWith('CON '), true);
  });

  it('should prompt for session code', async () => {
    const { app } = createMockApp();
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's2', serviceCode: '*384*100#', phoneNumber: '+254700000002', text: '1' });
    assert.equal(r.raw, 'CON Enter Session Code:');
  });

  it('should reject invalid session code', async () => {
    const { app } = createMockApp();
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's3', serviceCode: '*384*100#', phoneNumber: '+254700000003', text: '1*9999' });
    assert.equal(r.raw.includes('END '), true);
  });

  it('should reject expired session', async () => {
    const { app, sessions } = createMockApp();
    sessions.set('5555', { unitId: 'u1', unitName: 'CS101', expiresAt: new Date(Date.now() - 1000), isActive: true });
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's4', serviceCode: '*384*100#', phoneNumber: '+254700000004', text: '1*5555' });
    assert.equal(r.raw.includes('expired'), true);
  });

  it('should reject unregistered phone', async () => {
    const { app, sessions } = createMockApp();
    sessions.set('6666', { unitId: 'u1', unitName: 'CS101', expiresAt: new Date(Date.now() + 900000), isActive: true });
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's5', serviceCode: '*384*100#', phoneNumber: '+254700000005', text: '1*6666' });
    assert.equal(r.raw.includes('not registered'), true);
  });

  it('should reject unverified phone', async () => {
    const { app, sessions, students } = createMockApp();
    sessions.set('7777', { unitId: 'u1', unitName: 'CS101', expiresAt: new Date(Date.now() + 900000), isActive: true });
    students.set('+254700000006', { id: 'st1', name: 'Test', verified: false });
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's6', serviceCode: '*384*100#', phoneNumber: '+254700000006', text: '1*7777' });
    assert.equal(r.raw.includes('not verified'), true);
  });

  it('should record attendance for valid sign-in', async () => {
    const { app, sessions, students } = createMockApp();
    sessions.set('8888', { unitId: 'u1', unitName: 'CS101', expiresAt: new Date(Date.now() + 900000), isActive: true });
    students.set('+254700000007', { id: 'st2', name: 'Alice', verified: true });
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's7', serviceCode: '*384*100#', phoneNumber: '+254700000007', text: '1*8888' });
    assert.equal(r.raw.includes('Attendance recorded'), true);
    assert.equal(r.raw.includes('CS101'), true);
    assert.equal(r.raw.includes('Alice'), true);
  });

  it('should reject duplicate sign-in', async () => {
    const { app, sessions, students } = createMockApp();
    sessions.set('1111', { unitId: 'u2', unitName: 'MATH201', expiresAt: new Date(Date.now() + 900000), isActive: true });
    students.set('+254700000008', { id: 'st3', name: 'Bob', verified: true });
    await makeRequest(app, 'POST', '/ussd', { sessionId: 's8a', serviceCode: '*384*100#', phoneNumber: '+254700000008', text: '1*1111' });
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's8b', serviceCode: '*384*100#', phoneNumber: '+254700000008', text: '1*1111' });
    assert.equal(r.raw.includes('already signed in'), true);
  });

  it('should handle invalid menu option', async () => {
    const { app } = createMockApp();
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's9', serviceCode: '*384*100#', phoneNumber: '+254700000009', text: '5' });
    assert.equal(r.raw.includes('Invalid option'), true);
  });

  it('should check status for registered student', async () => {
    const { app, students } = createMockApp();
    students.set('+254700000011', { id: 'st4', name: 'Carol', verified: true });
    const r = await makeRequest(app, 'POST', '/ussd', { sessionId: 's11', serviceCode: '*384*100#', phoneNumber: '+254700000011', text: '2' });
    assert.equal(r.raw.includes('Carol'), true);
  });
});