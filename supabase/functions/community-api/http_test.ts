import { createHttpHelpers, getBearer, text } from './http.ts';

function assertEqual<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test(
  'JSON 응답은 허용된 origin과 개인정보 캐시 방지 헤더를 설정한다',
  async () => {
    const { respond } = createHttpHelpers(new Set(['https://archive.example']));
    const response = respond({ ok: true }, 201, 'https://archive.example');

    assertEqual(response.status, 201);
    assertEqual(
      response.headers.get('Access-Control-Allow-Origin'),
      'https://archive.example',
    );
    assertEqual(response.headers.get('Cache-Control'), 'no-store');
    assertEqual(await response.json().then((body) => body.ok), true);
  },
);

Deno.test('허용되지 않은 origin에는 CORS 허용 헤더를 내보내지 않는다', () => {
  const { corsHeaders } = createHttpHelpers(
    new Set(['https://archive.example']),
  );
  const headers = corsHeaders('https://untrusted.example');

  assertEqual(headers.has('Access-Control-Allow-Origin'), false);
});

Deno.test('Bearer 인증 헤더에서만 로그인 토큰을 읽는다', () => {
  assertEqual(
    getBearer(
      new Request('https://edge.example', {
        headers: { Authorization: 'Bearer token-value' },
      }),
    ),
    'token-value',
  );
  assertEqual(
    getBearer(
      new Request('https://edge.example', {
        headers: { Authorization: 'Basic token-value' },
      }),
    ),
    '',
  );
});

Deno.test('문자열 입력은 공백을 정리하고 글자 수 제한을 지킨다', () => {
  assertEqual(text('  축하합니다  ', 10), '축하합니다');

  let rejected = false;
  try {
    text('너무 길어요', 2);
  } catch {
    rejected = true;
  }
  assertEqual(rejected, true);
});
