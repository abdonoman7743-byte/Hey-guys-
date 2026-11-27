import test from 'node:test';
import assert from 'node:assert/strict';
import { authErrorMessage, isSilentAuthError, validateEmail, validatePassword } from './authUtils';

test('validateEmail', () => {
  assert.equal(validateEmail(''), 'emailRequired');
  assert.equal(validateEmail('abc'), 'emailInvalid');
  assert.equal(validateEmail('a@b'), 'emailInvalid');
  assert.equal(validateEmail(' a@b.co '), null);
});

test('validatePassword', () => {
  assert.equal(validatePassword(''), 'passwordRequired');
  assert.equal(validatePassword('123', true), 'passwordShort');
  assert.equal(validatePassword('123', false), null);
  assert.equal(validatePassword('123456', true), null);
});

test('authErrorMessage localizes and falls back', () => {
  assert.match(authErrorMessage({ code: 'auth/wrong-password' }, 'en'), /Incorrect/);
  assert.match(authErrorMessage({ code: 'auth/user-not-found' }, 'ar'), /حساب/);
  assert.match(authErrorMessage({ code: 'nope' }, 'en'), /Something went wrong/);
  assert.equal(isSilentAuthError({ code: 'auth/popup-closed-by-user' }), true);
});
