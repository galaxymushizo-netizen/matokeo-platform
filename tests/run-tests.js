/* Zero-dependency test runner for Matokeo Platform core logic.
 * Run: node tests/run-tests.js
 * Exit code 0 = all pass, 1 = failure. No frameworks added. */
'use strict';
const Core = require('../js/core.js');

const SUBS = [
  { key: 'hisabati', label: 'Hisabati' },
  { key: 'kiswahili', label: 'Kiswahili' },
  { key: 'english', label: 'English' },
  { key: 'jiografia', label: 'Jiografia na Michezo' },
  { key: 'sayansi', label: 'Sayansi' },
  { key: 'historia', label: 'Historia na Maadili' },
];

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    failures.push({ name, msg: e.message });
    console.log('  FAIL ' + name + '\n        ' + e.message);
  }
}
function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || '') + ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}
function assertDeepEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || '') + '\n        expected=' + b + '\n        actual  =' + a);
}
function mkStu(id, scores) { return { id, scores }; }

console.log('== grade() boundaries ==');
test('75 -> A', () => assertEq(Core.grade(75), 'A'));
test('100 -> A', () => assertEq(Core.grade(100), 'A'));
test('74.99 -> B', () => assertEq(Core.grade(74.99), 'B'));
test('60 -> B', () => assertEq(Core.grade(60), 'B'));
test('59 -> C', () => assertEq(Core.grade(59), 'C'));
test('45 -> C', () => assertEq(Core.grade(45), 'C'));
test('30 -> D', () => assertEq(Core.grade(30), 'D'));
test('29 -> F', () => assertEq(Core.grade(29), 'F'));
test('0 -> F', () => assertEq(Core.grade(0), 'F'));
test('null -> -', () => assertEq(Core.grade(null), '-'));
test('empty -> -', () => assertEq(Core.grade(''), '-'));
test('NaN string -> -', () => assertEq(Core.grade('abc'), '-'));
test('negative -> F (out of range still grades F)', () => assertEq(Core.grade(-5), 'F'));

console.log('== custom boundaries (teacher-configurable) ==');
test('custom A=80: 79 -> B', () => assertEq(Core.grade(79, { A: 80, B: 65, C: 50, D: 35 }), 'B'));
test('custom A=80: 80 -> A', () => assertEq(Core.grade(80, { A: 80, B: 65, C: 50, D: 35 }), 'A'));
test('bad boundaries fall back to defaults', () => assertEq(Core.grade(75, { A: 10, B: 90, C: 50, D: 60 }), 'A'));

console.log('== avg() modes ==');
const full = mkStu('f', { hisabati: 80, kiswahili: 70, english: 60, jiografia: 50, sayansi: 40, historia: 30 });
test('full marks, all mode: mean of 6 = 55', () => assertEq(Core.avg(full, SUBS, 'all'), 55));
test('full marks, scored mode: same 55', () => assertEq(Core.avg(full, SUBS, 'scored'), 55));
const partial = mkStu('p', { hisabati: 90, kiswahili: null, english: null, jiografia: null, sayansi: null, historia: null });
test('1 of 6 scored=90, all mode -> 15 (90/6)', () => assertEq(Core.avg(partial, SUBS, 'all'), 15));
test('1 of 6 scored=90, scored mode -> 90 (legacy)', () => assertEq(Core.avg(partial, SUBS, 'scored'), 90));
test('no scores -> 0', () => assertEq(Core.avg(mkStu('z', {}), SUBS, 'all'), 0));
test('rounding to 1 decimal: 70+65 -> 67.5', () =>
  assertEq(Core.avg(mkStu('r', { hisabati: 70, kiswahili: 65, english: null, jiografia: null, sayansi: null, historia: null }), SUBS, 'scored'), 67.5));

console.log('== totalMarks & missingSubjects ==');
test('totalMarks sums only numeric', () => assertEq(Core.totalMarks(partial, SUBS), 90));
test('totalMarks full = 330', () => assertEq(Core.totalMarks(full, SUBS), 330));
test('missingSubjects lists labels', () =>
  assertDeepEq(Core.missingSubjects(partial, SUBS), ['Kiswahili', 'English', 'Jiografia na Michezo', 'Sayansi', 'Historia na Maadili']));

console.log('== computePositions with ties (1,2,2,4) ==');
const roster = [
  mkStu('a', { hisabati: 80 }), mkStu('b', { hisabati: 70 }),
  mkStu('c', { hisabati: 70 }), mkStu('d', { hisabati: 40 }),
];
const avgFn = (s) => Core.avg(s, SUBS, 'scored');
test('tie at avg 70 -> both position 2, next is 4', () => {
  const p = Core.computePositions(roster, avgFn);
  assertEq(p.a, 1); assertEq(p.b, 2); assertEq(p.c, 2); assertEq(p.d, 4);
});
test('three-way tie all position 1', () => {
  const t = [mkStu('x', { hisabati: 50 }), mkStu('y', { hisabati: 50 }), mkStu('z', { hisabati: 50 })];
  const p = Core.computePositions(t, avgFn);
  assertEq(p.x, 1); assertEq(p.y, 1); assertEq(p.z, 1);
});
test('empty list -> empty map', () => assertDeepEq(Core.computePositions([], avgFn), {}));

console.log('== scoreError / validateScores ==');
test('valid 0-100 -> null', () => { assertEq(Core.scoreError(0), null); assertEq(Core.scoreError(100), null); assertEq(Core.scoreError('55'), null); });
test('negative -> error', () => assertEq(Core.scoreError(-1), '"-1" nje ya range (0-100)'));
test('over 100 -> error', () => assertEq(Core.scoreError(101), '"101" nje ya range (0-100)'));
test('NaN -> error', () => assertEq(Core.scoreError('abc'), '"abc" si nambari'));
test('empty/null -> allowed (missing)', () => { assertEq(Core.scoreError(''), null); assertEq(Core.scoreError(null), null); });
test('validateScores collects per-subject errors', () => {
  const errs = Core.validateScores({ hisabati: 200, kiswahili: -3, english: 50 }, SUBS);
  assertEq(errs.length, 2);
  assertEq(errs[0], 'Hisabati: "200" nje ya range (0-100)');
  assertEq(errs[1], 'Kiswahili: "-3" nje ya range (0-100)');
});

console.log('== parseImportRows (strict) ==');
const settings = { classes: ['7A', '7B'], terms: ['Term 1'], year: '2026' };
test('valid row passes', () => {
  const r = Core.parseImportRows([{ 'Jina': 'Amina', 'Darasa': '7A', 'Muda': 'Term 1', 'Hisabati': 82 }], SUBS, settings, []);
  assertEq(r.rows.length, 1); assertEq(r.errors.length, 0);
  assertEq(r.rows[0].scores.hisabati, 82);
});
test('empty file -> no rows, no errors', () => {
  const r = Core.parseImportRows([], SUBS, settings, []);
  assertEq(r.rows.length, 0); assertEq(r.errors.length, 0);
});
test('missing name -> error', () => {
  const r = Core.parseImportRows([{ 'Darasa': '7A', 'Muda': 'Term 1' }], SUBS, settings, []);
  assertEq(r.errors.length, 1); assertEq(r.errors[0].errors[0], 'Jina haijaandikwa');
});
test('missing class and term -> two errors', () => {
  const r = Core.parseImportRows([{ 'Jina': 'Boi' }], SUBS, settings, []);
  assertEq(r.errors[0].errors.length, 2);
});
test('invalid score 850 rejected, NOT silently nulled', () => {
  const r = Core.parseImportRows([{ 'Jina': 'A', 'Darasa': '7A', 'Muda': 'Term 1', 'Sayansi': 850 }], SUBS, settings, []);
  assertEq(r.errors.length, 1);
  assertEq(r.errors[0].errors[0], 'Sayansi: "850" nje ya range (0-100)');
});
test('non-numeric score rejected', () => {
  const r = Core.parseImportRows([{ 'Jina': 'A', 'Darasa': '7A', 'Muda': 'Term 1', 'English': 'abc' }], SUBS, settings, []);
  assertEq(r.errors.length, 1); assertEq(r.errors[0].errors[0], 'English: "abc" si nambari');
});
test('unknown class/term rejected', () => {
  const r = Core.parseImportRows([{ 'Jina': 'A', 'Darasa': '99Z', 'Muda': 'Term 9' }], SUBS, settings, []);
  assertEq(r.errors[0].errors.length, 2);
});
test('duplicate within file detected', () => {
  const rows = [
    { 'Jina': 'A', 'Darasa': '7A', 'Muda': 'Term 1' },
    { 'Jina': 'a', 'Darasa': '7A', 'Muda': 'Term 1' },
  ];
  const r = Core.parseImportRows(rows, SUBS, settings, []);
  assertEq(r.errors.length, 1);
  assertEq(r.errors[0].rowIndex, 3); // spreadsheet row number (1-indexed + header)
});
test('existing student in DB flagged, not imported', () => {
  const r = Core.parseImportRows(
    [{ 'Jina': 'Amina', 'Darasa': '7A', 'Muda': 'Term 1' }],
    SUBS, settings, [{ name: 'amina', class: '7A', term: 'Term 1' }]);
  assertEq(r.errors.length, 1);
  assertEq(r.rows.length, 0);
});
test('rowIndex maps to spreadsheet numbering (header=1)', () => {
  const r = Core.parseImportRows([{ 'Jina': 'A', 'Darasa': '7A', 'Muda': 'Term 1', 'Sayansi': 999 }], SUBS, settings, []);
  assertEq(r.errors[0].rowIndex, 2);
});

console.log('== planBackupMerge (never silent) ==');
test('same name+class+term -> toUpdate', () => {
  const plan = Core.planBackupMerge(
    [{ name: 'A', class: '7A', term: 'T1', scores: {} }],
    [{ name: 'A', class: '7A', term: 'T1', scores: { hisabati: 10 } }]);
  assertEq(plan.toAdd.length, 0); assertEq(plan.toUpdate.length, 1);
});
test('new student -> toAdd', () => {
  const plan = Core.planBackupMerge([], [{ name: 'B', class: '7A', term: 'T1', scores: {} }]);
  assertEq(plan.toAdd.length, 1);
});
test('malformed entries skipped', () => {
  const plan = Core.planBackupMerge([], [null, { class: '7A' }, { name: 'C', class: '7A', term: 'T1', scores: {} }]);
  assertEq(plan.toAdd.length, 1);
});

console.log('== validateSettings ==');
test('valid settings pass', () => assertDeepEq(Core.validateSettings({ classes: ['7A'], terms: ['T1'], gradeBoundaries: { A: 75, B: 60, C: 45, D: 30 }, avgMode: 'all' }), []));
test('descending boundary violation caught', () => assertEq(Core.validateSettings({ classes: ['7A'], terms: ['T1'], gradeBoundaries: { A: 10, B: 60, C: 45, D: 30 } }).length, 1));
test('empty classes caught', () => assertEq(Core.validateSettings({ classes: [], terms: ['T1'] }).length, 1));
test('bad avgMode caught', () => assertEq(Core.validateSettings({ classes: ['7A'], terms: ['T1'], avgMode: 'weird' }).length, 1));

console.log('\n==============================');
console.log('PASSED: ' + passed + '   FAILED: ' + failed);
if (failed) { failures.forEach(f => console.log('  FAILED: ' + f.name + ' — ' + f.msg)); process.exit(1); }
console.log('All tests passed.');
