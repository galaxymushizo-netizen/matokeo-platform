/* ============================================================
 * Matokeo Platform — Core Logic (pure functions, no DOM)
 * Loaded in browser (window.Core) and Node (module.exports).
 * All academic rules here are CONFIGURABLE via settings:
 *   gradeBoundaries: { A: 75, B: 60, C: 45, D: 30 }   (F = below D)
 *   avgMode: 'all'    -> divide by ALL subjects (missing = 0)
 *              'scored' -> divide by subjects with scores only
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_BOUNDARIES = { A: 75, B: 60, C: 45, D: 30 };

  /* ---------- Validation helpers ---------- */

  // Returns null if valid number 0-100, else an error string.
  function scoreError(v) {
    if (v === null || v === undefined || v === '') return null; // empty = missing, allowed
    var n = Number(v);
    if (isNaN(n)) return '"' + v + '" si nambari';
    if (n < 0 || n > 100) return '"' + v + '" nje ya range (0-100)';
    return null;
  }

  // scores: {subjectKey: value|null}; returns array of "Subject: reason" strings
  function validateScores(scores, subjects) {
    var errors = [];
    subjects.forEach(function (sub) {
      var err = scoreError(scores[sub.key]);
      if (err) errors.push(sub.label + ': ' + err);
    });
    return errors;
  }

  /* ---------- Grading ---------- */

  function normalizeBoundaries(b) {
    var out = {};
    for (var k in DEFAULT_BOUNDARIES) {
      var v = b && b[k] !== undefined && b[k] !== null && b[k] !== '' ? Number(b[k]) : DEFAULT_BOUNDARIES[k];
      if (isNaN(v) || v < 0 || v > 100) v = DEFAULT_BOUNDARIES[k];
      out[k] = v;
    }
    return out;
  }

  function grade(score, boundaries) {
    var b = normalizeBoundaries(boundaries);
    var n = Number(score);
    if (score === '' || score === null || score === undefined || isNaN(n)) return '-';
    if (n >= b.A) return 'A';
    if (n >= b.B) return 'B';
    if (n >= b.C) return 'C';
    if (n >= b.D) return 'D';
    return 'F';
  }

  /* ---------- Averages & totals ---------- */

  // mode 'all': missing subjects count as 0 and are included in the divisor.
  // mode 'scored': only subjects with numeric scores count (legacy behavior).
  function avg(stu, subjects, mode) {
    var m = mode === 'scored' ? 'scored' : 'all';
    var sum = 0, scored = 0;
    subjects.forEach(function (s) {
      var v = stu.scores ? stu.scores[s.key] : null;
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) {
        sum += Number(v);
        scored++;
      }
    });
    if (m === 'scored') return scored ? Math.round((sum / scored) * 10) / 10 : 0;
    return subjects.length ? Math.round((sum / subjects.length) * 10) / 10 : 0;
  }

  function totalMarks(stu, subjects) {
    var sum = 0;
    subjects.forEach(function (s) {
      var v = stu.scores ? stu.scores[s.key] : null;
      if (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) sum += Number(v);
    });
    return sum;
  }

  function missingSubjects(stu, subjects) {
    return subjects.filter(function (s) {
      var v = stu.scores ? stu.scores[s.key] : null;
      return v === null || v === undefined || v === '' || isNaN(Number(v));
    }).map(function (s) { return s.label; });
  }

  /* ---------- Ranking (competition ranking: 1,2,2,4) ---------- */

  function computePositions(list, avgFn) {
    var posMap = {};
    var sorted = list.map(function (s) { return { id: s.id, a: avgFn(s) }; })
      .sort(function (x, y) { return y.a - x.a; });
    var pos = 0;
    for (var i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i].a !== sorted[i - 1].a) pos = i + 1;
      posMap[sorted[i].id] = pos;
    }
    return posMap;
  }

  /* ---------- Import parsing (strict) ---------- */

  // rows: array of plain objects from XLSX sheet_to_json
  // Returns { rows: [{name, class, term, scores, rowIndex}], errors: [{rowIndex, name, errors: []}] }
  function parseImportRows(rows, subjects, settings, existingStudents) {
    var out = { rows: [], errors: [] };
    var seen = {}; // duplicate detection within the file
    existingStudents = existingStudents || [];

    rows.forEach(function (row, idx) {
      var rowErrors = [];
      var name = String(row['Jina'] || row['Name'] || row['jina'] || '').trim();
      var cls = String(row['Darasa'] || row['Class'] || row['darasa'] || '').trim();
      var term = String(row['Muda'] || row['Term'] || row['muda'] || '').trim();

      if (!name) rowErrors.push('Jina haijaandikwa');
      if (!cls) rowErrors.push('Darasa haijaandikwa');
      else if (settings.classes && settings.classes.length && settings.classes.indexOf(cls) === -1)
        rowErrors.push('Darasa "' + cls + '" halipo kwenye settings');
      if (!term) rowErrors.push('Muda haijaandikwa');
      else if (settings.terms && settings.terms.length && settings.terms.indexOf(term) === -1)
        rowErrors.push('Muda "' + term + '" haupo kwenye settings');

      var scores = {};
      subjects.forEach(function (sub) {
        var v = row[sub.label] !== undefined ? row[sub.label] : row[sub.key];
        if (v === undefined) v = '';
        v = String(v).trim();
        var err = scoreError(v === '' ? null : v);
        if (err) rowErrors.push(sub.label + ': ' + err);
        scores[sub.key] = (v === '' || err) ? null : Number(v);
      });

      if (name) {
        var dupKey = (name.toLowerCase() + '|' + cls + '|' + term);
        if (seen[dupKey] !== undefined) rowErrors.push('Duplicate ndani ya faili (mstari ' + (seen[dupKey] + 1) + ')');
        else seen[dupKey] = idx;
        var existsInDb = existingStudents.some(function (s) {
          return s.name && s.name.toLowerCase() === name.toLowerCase() && s.class === cls && s.term === term;
        });
        if (existsInDb) rowErrors.push(' Tayari yupo kwenye mfumo (hatokuingiza tena)');
      }

      if (rowErrors.length) out.errors.push({ rowIndex: idx + 2, name: name || '(hakuna jina)', errors: rowErrors });
      else out.rows.push({ name: name, class: cls, term: term, year: settings.year || '', scores: scores, rowIndex: idx + 2 });
    });
    return out;
  }

  /* ---------- Backup merge (explicit, never silent) ---------- */

  // Returns { toAdd: [], toUpdate: [{index, existing, incoming}] } — caller decides.
  function planBackupMerge(existingStudents, incomingStudents) {
    var plan = { toAdd: [], toUpdate: [] };
    incomingStudents.forEach(function (bs) {
      if (!bs || !bs.name) return;
      var i = existingStudents.findIndex(function (s) {
        return s.name === bs.name && s.class === bs.class && s.term === bs.term;
      });
      if (i !== -1) plan.toUpdate.push({ index: i, existing: existingStudents[i], incoming: bs });
      else plan.toAdd.push(bs);
    });
    return plan;
  }

  /* ---------- Settings validation ---------- */

  function validateSettings(s) {
    var errors = [];
    if (!s) return ['Settings hazipo'];
    if (!Array.isArray(s.classes) || !s.classes.length) errors.push('Angalau darasa moja linahitajika');
    if (!Array.isArray(s.terms) || !s.terms.length) errors.push('Angalau muda mmoja unahitajika');
    var b = normalizeBoundaries(s.gradeBoundaries);
    if (!(b.A > b.B && b.B > b.C && b.C > b.D)) errors.push('Mipaka ya gredi lazima ipungue: A > B > C > D');
    if (s.avgMode && s.avgMode !== 'all' && s.avgMode !== 'scored') errors.push('avgMode lazima iwe "all" au "scored"');
    return errors;
  }

  return {
    DEFAULT_BOUNDARIES: DEFAULT_BOUNDARIES,
    scoreError: scoreError,
    validateScores: validateScores,
    normalizeBoundaries: normalizeBoundaries,
    grade: grade,
    avg: avg,
    totalMarks: totalMarks,
    missingSubjects: missingSubjects,
    computePositions: computePositions,
    parseImportRows: parseImportRows,
    planBackupMerge: planBackupMerge,
    validateSettings: validateSettings
  };
});
