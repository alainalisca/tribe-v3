import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete in 2s
    http_req_failed: ['rate<0.05'],    // Less than 5% failures
  },
};

export default function () {
  // Test homepage
  let res = http.get('https://tribe-v3.vercel.app/');
  check(res, {
    'homepage status 200': (r) => r.status === 200,
  });
  sleep(1);

  // Test sessions page
  res = http.get('https://tribe-v3.vercel.app/sessions');
  check(res, {
    'sessions page status 200': (r) => r.status === 200,
  });
  sleep(1);
}
