import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVerificationLabs } from '../scripts/verification-selection.mjs';

test('disposable verification selects exact requested labs in catalog order', () => {
  const labs = [{ id: '07-web-breach-chain' }, { id: '08-cipher-locker' }, { id: '11-jwt-validation' }];
  assert.deepEqual(selectVerificationLabs(labs, ['11-jwt-validation', '07-web-breach-chain']), [labs[0], labs[2]]);
  assert.deepEqual(selectVerificationLabs(labs, []), labs);
  assert.deepEqual(selectVerificationLabs(labs, ['07-web-breach-chain', '07-web-breach-chain']), [labs[0]]);
  assert.throws(() => selectVerificationLabs(labs, ['unknown']), /Unknown verification lab: unknown/);
});
