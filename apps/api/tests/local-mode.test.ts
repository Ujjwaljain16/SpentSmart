import { converse } from '@spentsmart/assistant/loop';
import { EVAL_NOW, fixtureLedger } from '@spentsmart/assistant/evals/fixture';
import { firstUserMessage } from '@spentsmart/assistant/prompt';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { fakeModel } from '../src/fake-model';
import { createTestApp, testConfig } from './helpers';

let t: Awaited<ReturnType<typeof createTestApp>> | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

const env = { DATABASE_URL: 'pglite:memory', ACCESS_TOKEN_SECRET: 'x'.repeat(40) };

describe('test sign-in', () => {
  it('does not exist unless switched on', async () => {
    t = await createTestApp();
    const res = await t.app.inject({ method: 'POST', url: '/v1/auth/test', payload: { name: 'asha', deviceName: 'Pixel' } });
    expect(res.statusCode).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/v1/config' })).json()).toEqual({ testSignIn: false, assistant: false });
  });

  it('signs in by name when switched on, as a user separate from any Google account', async () => {
    t = await createTestApp({ config: { ...testConfig, testSignIn: true } });
    const a = (await t.app.inject({ method: 'POST', url: '/v1/auth/test', payload: { name: 'Asha', deviceName: 'Emulator' } })).json();
    const b = (await t.app.inject({ method: 'POST', url: '/v1/auth/test', payload: { name: 'asha', deviceName: 'Second' } })).json();
    expect(a.userId).toBe(b.userId);
    const google = await t.signIn('asha');
    expect(google.userId).not.toBe(a.userId);
    expect((await t.app.inject({ method: 'GET', url: '/v1/sync/pull', headers: { authorization: `Bearer ${a.accessToken}` } })).statusCode).toBe(200);
  });

  it('rejects odd names', async () => {
    t = await createTestApp({ config: { ...testConfig, testSignIn: true } });
    for (const name of ['a', 'x'.repeat(41), 'drop table;']) {
      expect((await t.app.inject({ method: 'POST', url: '/v1/auth/test', payload: { name, deviceName: 'P' } })).statusCode).toBe(400);
    }
  });

  it('cannot be switched on in production', () => {
    expect(() => loadConfig({ ...env, TEST_SIGN_IN: 'true', NODE_ENV: 'production' })).toThrow(/never be enabled in production/);
    expect(loadConfig({ ...env, TEST_SIGN_IN: 'true' }).testSignIn).toBe(true);
    // Without test sign-in a real deployment must name its Google clients.
    expect(() => loadConfig(env)).toThrow(/GOOGLE_CLIENT_IDS/);
  });
});

describe('fake model', () => {
  const ask = (question: string) =>
    converse({
      transport: { turn: fakeModel() },
      ledger: fixtureLedger(),
      now: EVAL_NOW,
      messages: [{ role: 'user', content: firstUserMessage(question, new Date(EVAL_NOW)) }],
    });

  it('answers through the real tools, quoting their amounts', async () => {
    const r = await ask('Am I within budget?');
    expect(r.toolCalls.map((c) => c.name)).toEqual(['budget_status']);
    expect(r.reply).toContain('₹40,000');
    expect(r.untraced).toEqual([]);
  });

  it('proposes additions with the amount from the question, not the date', async () => {
    const r = await ask('add 250 for lunch');
    expect(r.proposals).toEqual([expect.objectContaining({ kind: 'transaction', amountPaise: 25_000 })]);
    expect(r.reply).toMatch(/confirm/i);
  });

  it('checks affordability', async () => {
    const r = await ask('can I afford a 3000 dinner');
    expect(r.toolCalls[0]).toMatchObject({ name: 'can_i_afford', input: { amount_rupees: 3000 } });
  });
});
