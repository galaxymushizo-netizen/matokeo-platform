/* ============================================================
 * Live E2E test — runs against REAL Firebase project.
 * Creates test data, verifies rules in production, cleans up.
 * ============================================================ */
const { initializeApp, deleteApp } = require('firebase/app');
const {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} = require('firebase/auth');
const {
  getFirestore, doc, setDoc, getDoc, deleteDoc, collection, addDoc
} = require('firebase/firestore');

const CONFIG = {
  apiKey: "AIzaSyBXkSCW7SMaT9Iig6TvaKVDd4aBubRw1t0",
  authDomain: "matokeo-platform.firebaseapp.com",
  projectId: "matokeo-platform",
  storageBucket: "matokeo-platform.firebasestorage.app",
  messagingSenderId: "909369498980",
  appId: "1:909369498980:web:c4cfb48b726f71f9706e71",
  measurementId: "G-RTJRH6WWYR"
};

let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; failures.push(name + ' :: ' + e.message); console.log('FAIL ' + name + ' :: ' + e.message); }
}
function expectFail(fn, codeContains) {
  return fn().then(() => { throw new Error('Expected failure but succeeded'); })
    .catch(e => {
      if (e.message === 'Expected failure but succeeded') throw e;
      if (codeContains && !e.message.includes(codeContains) && !(e.code && e.code.includes(codeContains)))
        throw new Error('Expected error containing "' + codeContains + '" but got: ' + e.message);
    });
}

async function main() {
  const app = initializeApp(CONFIG);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const ts = Date.now();
  const adminEmail = 'test-admin-' + ts + '@matokeo-test.com';
  const teacherEmail = 'test-teacher-' + ts + '@matokeo-test.com';
  const password = 'TestPass123!';
  const schoolId = 'sch_test_' + ts;
  const joinCode = 'TEST' + ts.toString(36).toUpperCase().slice(-4);
  const studentId = 'stu_test_' + ts;

  console.log('--- Live E2E Test against REAL Firebase ---');
  console.log('Project:', CONFIG.projectId);
  console.log('Timestamp:', ts);
  console.log('');

  // 1. Create admin user
  console.log('--- 1. Admin signup ---');
  let adminCred;
  await t('Create admin user', async () => {
    adminCred = await createUserWithEmailAndPassword(auth, adminEmail, password);
  });
  if (!adminCred) { console.log('\nFATAL: Email/Password auth not enabled? Enable in Firebase Console → Authentication → Sign-in method'); await deleteApp(app); process.exit(1); }

  // 2. Create school + admin profile + join code
  console.log('--- 2. Create school + profile + join code ---');
  await t('Create school doc', async () => {
    await setDoc(doc(db, 'schools', schoolId), { name: 'TEST-DELETE-SCHOOL', createdBy: adminCred.user.uid, joinCode: joinCode });
  });
  await t('Create admin profile', async () => {
    await setDoc(doc(db, 'users', adminCred.user.uid), { fullName: 'Test Admin', email: adminEmail, role: 'admin', schoolId: schoolId });
  });
  await t('Create join code', async () => {
    await setDoc(doc(db, 'joinCodes', joinCode), { schoolId: schoolId, createdBy: adminCred.user.uid });
  });

  // 3. Sign out admin
  await t('Sign out admin', async () => { await signOut(auth); });

  // 4. Create teacher user
  console.log('--- 3. Teacher signup ---');
  let teacherCred;
  await t('Create teacher user', async () => {
    teacherCred = await createUserWithEmailAndPassword(auth, teacherEmail, password);
  });

  // 5. Teacher joins via code
  console.log('--- 4. Teacher joins via code ---');
  await t('Teacher creates profile with join code', async () => {
    await setDoc(doc(db, 'users', teacherCred.user.uid), { fullName: 'Test Teacher', email: teacherEmail, role: 'teacher', schoolId: schoolId, joinCode: joinCode });
  });

  // 6. Teacher adds a student
  console.log('--- 5. Teacher operations ---');
  await t('Teacher CAN add student', async () => {
    await setDoc(doc(db, 'schools', schoolId, 'students', studentId), { name: 'TEST-DELETE-STUDENT', class: '7A', term: 'Term 1', year: '2026', scores: { hisabati: 80 } });
  });

  // 7. Teacher tries to delete student (should FAIL)
  await t('Teacher CANNOT delete student (permission-denied)', async () => {
    await expectFail(() => deleteDoc(doc(db, 'schools', schoolId, 'students', studentId)), 'permission-denied');
  });

  // 8. Sign out teacher, sign in admin
  await t('Sign out teacher', async () => { await signOut(auth); });
  console.log('--- 6. Admin operations ---');
  await t('Sign in admin', async () => { await signInWithEmailAndPassword(auth, adminEmail, password); });

  // 9. Admin deletes student (should succeed)
  await t('Admin CAN delete student', async () => {
    await deleteDoc(doc(db, 'schools', schoolId, 'students', studentId));
  });

  // 10. Cleanup
  console.log('--- 7. Cleanup ---');
  await t('Delete join code', async () => { await deleteDoc(doc(db, 'joinCodes', joinCode)); });
  await t('Sign out admin', async () => { await signOut(auth); });
  await t('Sign in teacher (to delete self)', async () => { await signInWithEmailAndPassword(auth, teacherEmail, password); });
  await t('Delete teacher user', async () => { await auth.currentUser.delete(); });
  await t('Sign in admin (to delete self)', async () => { await signInWithEmailAndPassword(auth, adminEmail, password); });
  await t('Delete admin user', async () => { await auth.currentUser.delete(); });

  // School doc cannot be deleted (rules: delete: if false) — documented
  console.log('\n⚠️  School doc "' + schoolId + '" cannot be deleted (rules: delete: if false). Delete manually from Firebase Console if desired.');

  await deleteApp(app);
  console.log('\n==============================');
  console.log('LIVE E2E TESTS  PASSED: ' + passed + '   FAILED: ' + failed);
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
