const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'rate-limit-test-secret';
process.env.RATE_LIMIT_MAX = '2';
process.env.RATE_LIMIT_MAX_AUTH = '4';
delete require.cache[require.resolve('../src/middleware/rateLimiter')];
const { generalLimiter } = require('../src/middleware/rateLimiter');

function startServer() {
  const app = express();
  app.use(generalLimiter);
  app.get('/', (_req, res) => res.json({ ok: true }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function hit(base, token) {
  const res = await fetch(base, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return res.status;
}

test('verified staff get their own budget; anonymous and forged tokens share the IP limit', async () => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    assert.equal(await hit(base), 200);
    assert.equal(await hit(base), 200);
    assert.equal(await hit(base), 429, 'anonymous IP limit applies');

    const forged = jwt.sign({ id: 1, type: 'admin' }, 'wrong-secret');
    assert.equal(await hit(base, forged), 429, 'unverifiable token must not bypass the IP limit');

    const alice = jwt.sign({ id: 7, type: 'admin' }, process.env.JWT_SECRET);
    for (let i = 0; i < 4; i++) assert.equal(await hit(base, alice), 200);
    assert.equal(await hit(base, alice), 429, 'per-user limit applies');

    const bob = jwt.sign({ id: 8, type: 'admin' }, process.env.JWT_SECRET);
    assert.equal(await hit(base, bob), 200, 'another user on the same IP is unaffected');
  } finally {
    server.close();
  }
});
