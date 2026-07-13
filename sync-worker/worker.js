// trips-sync: shared checklist state for trips.trevorcardozo.com
// ponytail: KV is eventually consistent (~60s cross-region worst case); family in one car
// hits one POP, so effectively live. Upgrade path: Durable Object if it ever matters.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(req.url);
    const m = url.pathname.match(/^\/([\w-]{1,40})\/state$/);
    if (!m) return new Response('not found', { status: 404, headers: CORS });
    const trip = m[1];

    if (req.method === 'GET') {
      const state = (await env.TRIPS.get(trip)) || '{}';
      return new Response(state, { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return new Response('bad json', { status: 400, headers: CORS }); }
      const { id, v } = body;
      if (typeof id !== 'string' || !/^[\w-]{1,40}$/.test(id)) {
        return new Response('bad id', { status: 400, headers: CORS });
      }
      // ponytail: read-modify-write race window is milliseconds; family-scale taps don't collide
      const state = JSON.parse((await env.TRIPS.get(trip)) || '{}');
      if (v) state[id] = 1; else delete state[id];
      await env.TRIPS.put(trip, JSON.stringify(state));
      return new Response(JSON.stringify(state), { headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    return new Response('method', { status: 405, headers: CORS });
  },
};
