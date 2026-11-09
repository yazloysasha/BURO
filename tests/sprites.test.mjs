// Every enemy, animal and item must be big enough on screen to read as a sprite (see tools/audit_sprites.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAll, tooSmall } from '../tools/audit_sprites.mjs';

test('all enemies, animals and items render at a readable size', () => {
  const rows = auditAll();
  assert.equal(rows.filter((r) => r.kind === 'enemy').length, 25);
  assert.equal(rows.filter((r) => r.kind === 'animal').length, 89);
  assert.deepEqual(rows.filter(tooSmall).map((r) => r.id), []);
});
