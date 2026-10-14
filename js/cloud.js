/* ============================================================
 * Matokeo Platform — Cloud data layer (Firestore, compat SDK)
 * Paths:
 *   schools/{schoolId}             -> settings doc (admin-writable)
 *   schools/{schoolId}/students/{id} -> student docs
 * Offline: localStorage cache per user + dirty flag; sync on reconnect.
 * Globals: Cloud
 * ============================================================ */
(function () {
  'use strict';

  var SYNC = { state: 'off', msg: '' }; // off | ok | syncing | error
  var _onSyncChange = function () {};
  var _dirty = false;
  var _lastSync = 0; // epoch ms of last successful full sync

  function db() { return firebase.firestore(); }
  function uid() { return window.Auth && Auth.current ? Auth.current.uid : null; }
  function schoolId() { return window.Auth && Auth.current ? Auth.current.schoolId : null; }

  function cacheKey(suffix) { return 'mtk_cache_' + uid() + '_' + suffix; }
  function setSync(state, msg) { SYNC = { state: state, msg: msg || '' }; _onSyncChange(SYNC); }

  function setLocalCache(students, settings) {
    try {
      localStorage.setItem(cacheKey('students'), JSON.stringify(students || []));
      if (settings) localStorage.setItem(cacheKey('settings'), JSON.stringify(settings));
    } catch (e) { console.warn('Local cache write failed (storage full?)', e); }
  }
  function getLocalStudents() {
    try { return JSON.parse(localStorage.getItem(cacheKey('students')) || '[]'); } catch (e) { return []; }
  }
  function getLocalSettings() {
    try { return JSON.parse(localStorage.getItem(cacheKey('settings')) || 'null'); } catch (e) { return null; }
  }
  function isDirty() { return localStorage.getItem(cacheKey('dirty')) === '1'; }
  function setDirty(v) { _dirty = v; try { localStorage.setItem(cacheKey('dirty'), v ? '1' : '0'); } catch (e) {} }

  /* ---------- Load: cloud -> {settings, students} ---------- */
  function loadAll() {
    if (!schoolId()) return Promise.reject(new Error('Hakuna shule'));
    setSync('syncing');
    var sid = schoolId();
    return db().collection('schools').doc(sid).get().then(function (sSnap) {
      var settings = sSnap.exists ? sSnap.data() : null;
      return db().collection('schools').doc(sid).collection('students').get().then(function (q) {
        var students = [];
        q.forEach(function (d) {
          var s = d.data();
          s.id = d.id;
          students.push(s);
        });
        setLocalCache(students, settings);
        setDirty(false);
        _lastSync = Date.now();
        setSync('ok');
        return { settings: settings, students: students };
      });
    }).catch(function (err) {
      setSync('error', friendly(err));
      throw err;
    });
  }

  /* ---------- Push changed students (batch, max 450 ops per batch) ---------- */
  function pushStudents(students, deletedIds) {
    if (!schoolId()) return Promise.resolve();
    setSync('syncing');
    var sid = schoolId();
    var col = db().collection('schools').doc(sid).collection('students');
    var changed = students.filter(function (s) { return s._dirty; });
    var dels = deletedIds || [];

    function writeBatch(list, delList) {
      var batch = db().batch();
      list.slice(0, 400).forEach(function (s) {
        var clean = Object.assign({}, s);
        delete clean._dirty;
        batch.set(col.doc(s.id), clean);
      });
      delList.slice(0, 400).forEach(function (id) { batch.delete(col.doc(id)); });
      return batch.commit().then(function () {
        return list.length > 400 || delList.length > 400
          ? writeBatch(list.slice(400), delList.slice(400))
          : Promise.resolve();
      });
    }

    return writeBatch(changed, dels).then(function () {
      students.forEach(function (s) { delete s._dirty; });
      setLocalCache(students);
      setDirty(false);
      _lastSync = Date.now();
      setSync('ok');
    }).catch(function (err) {
      setDirty(true);
      setSync('error', friendly(err));
      throw err;
    });
  }

  /* ---------- Settings (admin-only by rules) ---------- */
  function pushSettings(settings) {
    if (!schoolId()) return Promise.resolve();
    setSync('syncing');
    var sid = schoolId();
    return db().collection('schools').doc(sid).set(settings, { merge: true }).then(function () {
      setLocalCache(getLocalStudents(), settings);
      _lastSync = Date.now();
      setSync('ok');
    }).catch(function (err) {
      setSync('error', friendly(err));
      throw err;
    });
  }

  /* ---------- Danger zone (admin-only by rules) ---------- */
  function deleteStudent(id) {
    if (!schoolId()) return Promise.resolve();
    return db().collection('schools').doc(schoolId()).collection('students').doc(id).delete();
  }
  function deleteAllStudents(currentStudents) {
    if (!schoolId()) return Promise.resolve();
    var col = db().collection('schools').doc(schoolId()).collection('students');
    var ids = currentStudents.map(function (s) { return s.id; });
    function chunk(list) {
      if (!list.length) return Promise.resolve();
      var batch = db().batch();
      list.slice(0, 400).forEach(function (id) { batch.delete(col.doc(id)); });
      return batch.commit().then(function () { return chunk(list.slice(400)); });
    }
    return chunk(ids);
  }

  /* ---------- User management (admin) ---------- */
  function listSchoolUsers() {
    if (!schoolId()) return Promise.resolve([]);
    return db().collection('users').where('schoolId', '==', schoolId()).get()
      .then(function (q) {
        var out = [];
        q.forEach(function (d) { var u = d.data(); u.uid = d.id; out.push(u); });
        return out;
      });
  }
  function setUserRole(targetUid, role) {
    return db().collection('users').doc(targetUid).update({ role: role });
  }
  function regenerateJoinCode() {
    if (!schoolId()) return Promise.reject(new Error('Hakuna shule'));
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    var code = '';
    for (var i = 0; i < 6; i++) code += abc[buf[i] % abc.length];
    var old = window.SETTINGS && SETTINGS.joinCode;
    var batch = db().batch();
    batch.set(db().collection('schools').doc(schoolId()), { joinCode: code }, { merge: true });
    batch.set(db().collection('joinCodes').doc(code), { schoolId: schoolId(), createdBy: Auth.current.uid, createdAt: new Date().toISOString() });
    if (old) batch.delete(db().collection('joinCodes').doc(old));
    return batch.commit().then(function () { return code; });
  }

  function friendly(err) {
    var code = err && err.code ? err.code : '';
    if (code === 'permission-denied') return 'Ruhusa imekataliwa (Firestore rules)';
    if (code === 'unavailable' || code === 'failed-precondition') return 'Mtandao haupatikani';
    return (err && err.message) || 'Hitilafu ya cloud';
  }

  window.Cloud = {
    loadAll: loadAll,
    pushStudents: pushStudents,
    pushSettings: pushSettings,
    deleteStudent: deleteStudent,
    deleteAllStudents: deleteAllStudents,
    listSchoolUsers: listSchoolUsers,
    setUserRole: setUserRole,
    regenerateJoinCode: regenerateJoinCode,
    isDirty: function () { return _dirty || isDirty(); },
    setDirty: setDirty,
    setSyncListener: function (fn) { _onSyncChange = fn || function () {}; },
    get state() { return SYNC; }
  };
})();
