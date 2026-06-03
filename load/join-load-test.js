import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

// --- config -------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SERVER_COUNT = Number(__ENV.SERVER_COUNT || 100);
const SEED = Number(__ENV.SEED || 1337);

// Deterministic PRNG so the init context and setup() agree on the plan.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build the same plan everywhere from the seed.
function buildPlan() {
  const rng = mulberry32(SEED);
  const capacities = [];
  const joiners = [];
  const jobs = []; // [{ serverIndex, joinerIndex }]
  for (let i = 0; i < SERVER_COUNT; i++) {
    const capacity = 8 + 2 * Math.floor(rng() * 5); // even in [8,16]
    const joinerCount = 20 + Math.floor(rng() * 31); // [20,50]
    capacities.push(capacity);
    joiners.push(joinerCount);
    for (let j = 0; j < joinerCount; j++) {
      jobs.push({ serverIndex: i, joinerIndex: j });
    }
  }
  const expectedSuccess = capacities.reduce((acc, cap, i) => acc + Math.min(cap, joiners[i]), 0);
  return { capacities, joiners, jobs, expectedSuccess };
}

const PLAN = buildPlan();

// --- metrics ------------------------------------------------------------
const joinSuccess = new Counter('join_success');
const joinFull = new Counter('join_full');
const joinUnexpected = new Counter('join_unexpected');

export const options = {
  scenarios: {
    join_storm: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: PLAN.jobs.length,
      maxDuration: '5m',
    },
  },
  thresholds: {
    checks: ['rate==1.0'],
    join_unexpected: ['count==0'],
    join_success: [`count==${PLAN.expectedSuccess}`],
  },
};

function jsonHeaders(userId, idempotencyKey) {
  return {
    'Content-Type': 'application/json',
    'x-user-id': userId,
    'x-user-role': 'player',
    'Idempotency-Key': idempotencyKey,
  };
}

// --- setup: create the servers -----------------------------------------
export function setup() {
  const serverIds = [];
  for (let i = 0; i < SERVER_COUNT; i++) {
    const body = JSON.stringify({ name: `srv-${i}`, requiredPlayers: PLAN.capacities[i] });
    const res = http.post(`${BASE_URL}/servers`, body, {
      headers: jsonHeaders('loadtest-admin', `create-${SEED}-${i}`),
    });
    check(res, { 'server created (201)': (r) => r.status === 201 });
    serverIds.push(JSON.parse(res.body).data.server.id);
  }
  return { serverIds };
}

// --- the storm: each iteration is one join attempt ----------------------
export default function (data) {
  const idx = exec.scenario.iterationInTest;
  const job = PLAN.jobs[idx];
  const serverId = data.serverIds[job.serverIndex];
  const userId = `s${job.serverIndex}-u${job.joinerIndex}`;

  const res = http.post(`${BASE_URL}/servers/${serverId}/join`, null, {
    headers: jsonHeaders(userId, `join-${serverId}-${userId}`),
  });

  const ok = check(res, {
    'join resolved (201 or 409)': (r) => r.status === 201 || r.status === 409,
  });

  if (res.status === 201) {
    joinSuccess.add(1);
  } else if (res.status === 409 && safeCode(res) === 'SERVER_FULL') {
    joinFull.add(1);
  } else if (!ok) {
    joinUnexpected.add(1);
  }
}

function safeCode(res) {
  try {
    return JSON.parse(res.body).errorCode;
  } catch (_e) {
    return 'UNKNOWN';
  }
}

// --- teardown: verify the invariants ------------------------------------
export function teardown(data) {
  const openRes = http.get(`${BASE_URL}/servers`, {
    headers: jsonHeaders('loadtest-admin', `list-${SEED}`),
  });
  const openIds = new Set(JSON.parse(openRes.body).data.map((s) => s.id));

  for (let i = 0; i < SERVER_COUNT; i++) {
    const serverId = data.serverIds[i];
    const capacity = PLAN.capacities[i];
    const joiners = PLAN.joiners[i];
    const expected = Math.min(capacity, joiners);
    const isFull = joiners >= capacity;

    const res = http.get(`${BASE_URL}/servers/${serverId}`, {
      headers: jsonHeaders('loadtest-admin', `get-${SEED}-${i}`),
    });
    const detail = JSON.parse(res.body).data;

    check(detail, {
      'current_players never exceeds capacity': (d) => d.server.currentPlayers <= capacity,
      'exactly expected players joined': (d) => d.server.currentPlayers === expected,
      'member count matches current_players': (d) => d.memberCount === d.server.currentPlayers,
      'full server flagged full': (d) => (isFull ? d.server.status === 'full' : true),
      'full server hidden from list': () => (isFull ? !openIds.has(serverId) : true),
      'open server visible in list': () => (isFull ? true : openIds.has(serverId)),
    });
  }

  verifyReplay();
}

// Secondary check: idempotent replay under the same key returns the same body.
function verifyReplay() {
  const createKey = `replay-create-${SEED}`;
  const body = JSON.stringify({ name: 'replay-srv', requiredPlayers: 8 });
  const first = http.post(`${BASE_URL}/servers`, body, {
    headers: jsonHeaders('replay-user', createKey),
  });
  const replay = http.post(`${BASE_URL}/servers`, body, {
    headers: jsonHeaders('replay-user', createKey),
  });

  check(replay, {
    'replay returns IDEMPOTENCY_REPLAYED header': (r) =>
      r.headers.Idempotency_replayed === 'true' || r.headers['Idempotency-Replayed'] === 'true',
    'replay body matches original': (r) => r.body === first.body,
  });
}
