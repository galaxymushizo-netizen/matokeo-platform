/* ============================================================
 * Matokeo Platform — Authentication (Firebase Auth, compat SDK)
 * Replaces the old client-side localStorage auth entirely.
 * Globals: Auth
 * ============================================================ */
(function () {
  'use strict';

  var _onChange = null;
  var _unsub = null;
  var current = null; // {uid, email, fullName, role, schoolId}

  function init(onChange) {
    _onChange = onChange || function () {};
    _unsub = firebase.auth().onAuthStateChanged(function (user) {
      if (!user) { current = null; _onChange(null); return; }
      // Load the profile doc created at signup.
      firebase.firestore().collection('users').doc(user.uid).get()
        .then(function (doc) {
          if (doc.exists) {
            var d = doc.data();
            current = { uid: user.uid, email: user.email || d.email || '', fullName: d.fullName || '', role: d.role || 'teacher', schoolId: d.schoolId || '' };
          } else {
            // Authenticated but no profile (e.g. rules blocked creation): treat as signed out.
            current = null;
            firebase.auth().signOut();
          }
          _onChange(current);
        })
        .catch(function (err) {
          console.error('Profile load failed:', err);
          current = null;
          _onChange(null, err);
        });
    });
  }

  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

  /* opts: {fullName, email, password, mode:'create'|'join', schoolName, joinCode} */
  function signUp(opts) {
    if (!opts.fullName || opts.fullName.trim().length < 2) return Promise.reject(new Error('Weka jina kamili (herufi 2+).'));
    if (!validEmail(opts.email || '')) return Promise.reject(new Error('Barua pepe si sahihi.'));
    if (!opts.password || opts.password.length < 8) return Promise.reject(new Error('Nywila iwe angalau herufi 8.'));
    if (opts.mode !== 'create' && opts.mode !== 'join') return Promise.reject(new Error('Chagua aina ya akaunti.'));
    if (opts.mode === 'create' && !(opts.schoolName || '').trim()) return Promise.reject(new Error('Weka jina la shule.'));
    if (opts.mode === 'join' && !(opts.joinCode || '').trim()) return Promise.reject(new Error('Weka Join Code ya shule.'));

    var db = firebase.firestore();
    var uid = null;

    return firebase.auth().createUserWithEmailAndPassword(opts.email.trim(), opts.password)
      .then(function (cred) {
        uid = cred.user.uid;
        if (opts.mode === 'join') {
          // Look up the school by join code, then create a teacher profile.
          return db.collection('joinCodes').doc(opts.joinCode.trim().toUpperCase()).get()
            .then(function (snap) {
              if (!snap.exists) throw new Error('Join Code haipo. Uliandikwa sawa?');
              var schoolId = snap.data().schoolId;
              return db.collection('users').doc(uid).set({
                fullName: opts.fullName.trim(),
                email: opts.email.trim(),
                role: 'teacher',
                schoolId: schoolId,
                joinCode: opts.joinCode.trim().toUpperCase(),
                createdAt: new Date().toISOString()
              });
            });
        }
        // Admin path: create the school first, then the admin profile.
        var schoolId = 'sch_' + uid.slice(0, 10) + '_' + Date.now().toString(36);
        var joinCode = genJoinCode();
        return db.collection('schools').doc(schoolId).set({
          name: opts.schoolName.trim(),
          createdBy: uid,
          joinCode: joinCode, // denormalized for admin display; joinCodes/{code} is the join gate
          createdAt: new Date().toISOString()
        }).then(function () {
          return db.collection('joinCodes').doc(joinCode).set({ schoolId: schoolId, createdBy: uid, createdAt: new Date().toISOString() });
        }).then(function () {
          return db.collection('users').doc(uid).set({
            fullName: opts.fullName.trim(),
            email: opts.email.trim(),
            role: 'admin',
            schoolId: schoolId,
            createdAt: new Date().toISOString()
          });
        }).then(function () { return joinCode; });
      })
      .catch(function (err) {
        // If profile creation failed after auth, sign out to avoid an orphaned session.
        if (uid && firebase.auth().currentUser) firebase.auth().signOut();
        throw translateError(err);
      });
  }

  function signIn(email, password) {
    if (!validEmail(email || '')) return Promise.reject(new Error('Barua pepe si sahihi.'));
    if (!password) return Promise.reject(new Error('Weka nywila.'));
    return firebase.auth().signInWithEmailAndPassword(email.trim(), password)
      .catch(function (err) { throw translateError(err); });
  }

  function signOut() {
    return firebase.auth().signOut();
  }

  function googleSignIn() {
    var provider = new firebase.auth.GoogleAuthProvider();
    return firebase.auth().signInWithPopup(provider)
      .then(function (cred) {
        return firebase.firestore().collection('users').doc(cred.user.uid).get()
          .then(function (doc) {
            return { user: cred.user, isNew: !doc.exists };
          });
      })
      .catch(function (err) { throw translateError(err); });
  }

  function completeGoogleSignup(opts) {
    var user = firebase.auth().currentUser;
    if (!user) return Promise.reject(new Error('Hujaingia. Jaribu tena.'));
    if (opts.mode !== 'create' && opts.mode !== 'join') return Promise.reject(new Error('Chagua aina ya akaunti.'));
    if (opts.mode === 'create' && !(opts.schoolName || '').trim()) return Promise.reject(new Error('Weka jina la shule.'));
    if (opts.mode === 'join' && !(opts.joinCode || '').trim()) return Promise.reject(new Error('Weka Join Code ya shule.'));

    var db = firebase.firestore();
    var uid = user.uid;

    if (opts.mode === 'join') {
      return db.collection('joinCodes').doc(opts.joinCode.trim().toUpperCase()).get()
        .then(function (snap) {
          if (!snap.exists) throw new Error('Join Code haipo. Uliandikwa sawa?');
          var schoolId = snap.data().schoolId;
          return db.collection('users').doc(uid).set({
            fullName: opts.fullName || user.displayName || '',
            email: user.email || '',
            role: 'teacher',
            schoolId: schoolId,
            joinCode: opts.joinCode.trim().toUpperCase(),
            createdAt: new Date().toISOString()
          });
        });
    }
    var schoolId = 'sch_' + uid.slice(0, 10) + '_' + Date.now().toString(36);
    var joinCode = genJoinCode();
    return db.collection('schools').doc(schoolId).set({
      name: opts.schoolName.trim(),
      createdBy: uid,
      joinCode: joinCode,
      createdAt: new Date().toISOString()
    }).then(function () {
      return db.collection('joinCodes').doc(joinCode).set({ schoolId: schoolId, createdBy: uid, createdAt: new Date().toISOString() });
    }).then(function () {
      return db.collection('users').doc(uid).set({
        fullName: opts.fullName || user.displayName || '',
        email: user.email || '',
        role: 'admin',
        schoolId: schoolId,
        createdAt: new Date().toISOString()
      });
    }).then(function () { return joinCode; });
  }

  function genJoinCode() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars (0/O, 1/I)
    var s = '';
    var buf = new Uint8Array(6);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(buf) : buf.forEach(function (_, i) { buf[i] = Math.floor(Math.random() * 256); });
    for (var i = 0; i < 6; i++) s += abc[buf[i] % abc.length];
    return s;
  }

  function translateError(err) {
    var code = err && err.code ? err.code : '';
    if (code === 'auth/email-already-in-use') return new Error('Barua pepe hii imetumika. Ingia badala ya kujiandikisha.');
    if (code === 'auth/weak-password') return new Error('Nywila dhaifu — tumia angalau herufi 8.');
    if (code === 'auth/invalid-email') return new Error('Barua pepe si sahihi.');
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
      return new Error('Barua pepe au nywila si sahihi.');
    if (code === 'auth/too-many-requests') return new Error('Majaribio mengi mno. Subiri kidogo.');
    if (code === 'auth/network-request-failed') return new Error('Hakuna mtandao. Angalia muunganisho.');
    if (code === 'permission-denied') return new Error('Ruhusa imekataliwa na Firestore rules.');
    return err instanceof Error ? err : new Error((err && err.message) || 'Hitilafu haijulikani');
  }

  window.Auth = { init: init, signUp: signUp, signIn: signIn, signOut: signOut, googleSignIn: googleSignIn, completeGoogleSignup: completeGoogleSignup, get current() { return current; } };
})();
