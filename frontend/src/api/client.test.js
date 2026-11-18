import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, qs, setAccessToken, subscribe } from './client';

const encoder = new TextEncoder();
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A text/event-stream response that delivers the given chunks, then ends. */
const stream = (chunks) => new Response(new ReadableStream({
  start(c) {
    chunks.forEach((x) => c.enqueue(encoder.encode(x)));
    c.close();
  },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

const flush = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('qs', () => {
  it('skips empty values', () => {
    expect(qs({ a: 1, b: '', c: null, d: undefined, e: false, f: 'x y' })).toBe('?a=1&f=x+y');
    expect(qs({})).toBe('');
  });
});

describe('api', () => {
  it('refreshes the session once on 401 and retries with the new token', async () => {
    setAccessToken('old');
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(401, { code: 'UNAUTHORIZED' }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new', user: { id: 1 } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetch);
    await expect(api('/me')).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer new');
  });

  it('turns problem details into an ApiError with field errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(400, { detail: 'Fix it', code: 'VALIDATION_FAILED', errors: { title: 'Too short' } })));
    await expect(api('/manage/events', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400, code: 'VALIDATION_FAILED', errors: { title: 'Too short' }, message: 'Fix it',
    });
  });
});

describe('subscribe (live attendance stream)', () => {
  it('parses events split across chunks and ignores heartbeats', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(stream([
        'event:hello\ndata:{"entered":3}\n\n:ping\n\n',
        'event:scan\nid:7\ndata:{"item":{"id":7,"res',
        'ult":"SUCCESS"},"entered":4}\r\n\r\n',
      ]))
      .mockResolvedValue(json(403, { code: 'FORBIDDEN' }));
    vi.stubGlobal('fetch', fetch);
    const events = [];
    const states = [];
    const stop = subscribe('/manage/events/1/live', (name, data) => events.push([name, data]), (s) => states.push(s));
    await vi.waitFor(() => expect(states).toContain('reconnecting'));
    expect(events).toEqual([['hello', { entered: 3 }], ['scan', { item: { id: 7, result: 'SUCCESS' }, entered: 4 }]]);
    stop();
  });

  it('stops for good when access is refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { code: 'FORBIDDEN' })));
    const states = [];
    subscribe('/manage/events/1/live', () => {}, (s) => states.push(s));
    await flush();
    expect(states).toEqual(['stopped']);
  });
});
