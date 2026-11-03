import assert from 'node:assert/strict';
import { previousRange, isLastWorkdayOfMonth, periodRange } from '../src/lib/dates.ts';
// 2026-11-03 est un mardi
assert.deepEqual(previousRange('day', '2026-11-03', '2026-11-03'), { from: '2026-11-02', to: '2026-11-02' });
assert.deepEqual(previousRange('day', '2026-11-02', '2026-11-02'), { from: '2026-10-30', to: '2026-10-30' }); // lundi -> vendredi
assert.deepEqual(previousRange('week', '2026-11-02', '2026-11-04'), { from: '2026-10-26', to: '2026-10-28' });
assert.deepEqual(previousRange('month', '2026-11-01', '2026-11-03'), { from: '2026-10-01', to: '2026-10-03' });
assert.deepEqual(previousRange('month', '2026-03-01', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' }); // plafonné
assert.deepEqual(previousRange('month', '2026-01-01', '2026-01-15'), { from: '2025-12-01', to: '2025-12-15' });
assert.equal(isLastWorkdayOfMonth('2026-10-30'), true);  // vendredi, 31 = samedi
assert.equal(isLastWorkdayOfMonth('2026-11-30'), true);  // lundi
assert.equal(isLastWorkdayOfMonth('2026-11-27'), false);
assert.equal(isLastWorkdayOfMonth('2026-12-31'), true);  // jeudi
assert.equal(isLastWorkdayOfMonth('2026-07-31'), true);  // vendredi
console.log('dates OK');
