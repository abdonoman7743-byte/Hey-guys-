import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUsername,
  validateUsername,
  getDeterministicPairId,
  formatCallDuration,
  formatLastSeen,
  sanitizeMessageText,
  getInitials,
} from './chatUtils';

test('normalizeUsername strips @ and lowercases/trims', () => {
  assert.equal(normalizeUsername('  @Omar_99 '), 'omar_99');
  assert.equal(normalizeUsername('@@Alice'), 'alice');
});

test('validateUsername enforces length and allowed characters', () => {
  assert.deepEqual(validateUsername('ab'), {
    valid: false,
    normalized: 'ab',
    reason: 'too_short',
  });
  assert.deepEqual(validateUsername('a'.repeat(25)), {
    valid: false,
    normalized: 'a'.repeat(25),
    reason: 'too_long',
  });
  assert.deepEqual(validateUsername('bad-name!'), {
    valid: false,
    normalized: 'bad-name!',
    reason: 'invalid_chars',
  });
  assert.deepEqual(validateUsername('@Layla_Dev24'), {
    valid: true,
    normalized: 'layla_dev24',
  });
});

test('getDeterministicPairId is order-independent', () => {
  assert.equal(
    getDeterministicPairId('uid_z', 'uid_a'),
    getDeterministicPairId('uid_a', 'uid_z')
  );
  assert.equal(getDeterministicPairId('uid_z', 'uid_a'), 'uid_a__uid_z');
});

test('formatCallDuration formats seconds accurately', () => {
  assert.equal(formatCallDuration(0), '00:00');
  assert.equal(formatCallDuration(65), '01:05');
  assert.equal(formatCallDuration(3661), '01:01:01');
});

test('formatLastSeen formats bilingual relative times', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatLastSeen(now - 20_000, 'en', now), 'Last seen just now');
  assert.equal(formatLastSeen(now - 20_000, 'ar', now), 'آخر ظهور الآن');
  assert.equal(formatLastSeen(now - 5 * 60_000, 'en', now), 'Last seen 5m ago');
  assert.equal(formatLastSeen(now - 5 * 60_000, 'ar', now), 'آخر ظهور قبل 5 د');
});

test('sanitizeMessageText normalizes line endings and trims', () => {
  assert.equal(sanitizeMessageText('  hello\r\nworld  '), 'hello\nworld');
  assert.equal(sanitizeMessageText('x'.repeat(5000)).length, 4000);
});

test('getInitials handles single and multi-word names', () => {
  assert.equal(getInitials('Tariq Mansour'), 'TM');
  assert.equal(getInitials('Layla'), 'LA');
  assert.equal(getInitials(''), '?');
});
