// K6 load test for the SoroSense HTTP read surface (API QA, U4).
// Run against a booted mock-mode backend (offline, deterministic):
//   pnpm -C backend exec tsx src/http/server.ts   # (mock mode: no integration env)
//   k6 run qa/k6/read-endpoints.js                 # BASE overridable via -e BASE=…
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 30,
  duration: '20s',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95th percentile under 500ms
    http_req_failed: ['rate<0.01'],   // <1% errors
  },
};

const BASE = __ENV.BASE || 'http://localhost:8787';
const DEPOSITOR = __ENV.DEPOSITOR || 'GAB5UOJLZWZUXVUB3POD3RBQTD53PQGVOVKVAONBDFXCOO2IY3LIDFJB';

const ENDPOINTS = [
  '/health',
  `/holdings?depositor=${DEPOSITOR}`,
  `/activity?depositor=${DEPOSITOR}&actor=you`,
  `/earnings?depositor=${DEPOSITOR}`,
  '/funding',
];

export default function () {
  for (const path of ENDPOINTS) {
    const res = http.get(`${BASE}${path}`);
    check(res, { 'status is 200': (r) => r.status === 200 });
  }
  sleep(0.1);
}
