/* ============================================================
 * Firestore Security Rules tests — run against LOCAL emulator.
 * No production data is touched. Run via firebase emulators:exec.
 * ============================================================ */
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

let env;
let passed = 0, failed = 0;
const failures = [];

async function t(name, fn) {
  try { await fn(); passed++; console.log('ok   ' + name); }
  catch (e) { failed++; failures.push(name + ' :: ' + e.message); console.log('FAIL ' + name + ' :: ' + e.message); }
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: 'matokeo-rules-test',
    firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') },
  });
  await env.clearFirestore();

  /* ---- Seed data (rules bypassed — this is setup, not a test) ---- */
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'schools/schA'), { name: 'Shule A', createdBy: 'admin1', joinCode: 'AAAAAA' });
    await setDoc(doc(db, 'schools/schB'), { name: 'Shule B', createdBy: 'admin2', joinCode: 'BBBBBB' });
    await setDoc(doc(db, 'joinCodes/AAAAAA'), { schoolId: 'schA', createdBy: 'admin1' });
    await setDoc(doc(db, 'joinCodes/BBBBBB'), { schoolId: 'schB', createdBy: 'admin2' });
    await setDoc(doc(db, 'users/admin1'), { fullName: 'Admin One', email: 'a@a.tz', role: 'admin', schoolId: 'schA' });
    await setDoc(doc(db, 'users/teacher1'), { fullName: 'Teacher One', email: 't@a.tz', role: 'teacher', schoolId: 'schA', joinCode: 'AAAAAA' });
    await setDoc(doc(db, 'users/teacherB'), { fullName: 'Teacher B', email: 'b@b.tz', role: 'teacher', schoolId: 'schB', joinCode: 'BBBBBB' });
    await setDoc(doc(db, 'schools/schA/students/stu1'), { name: 'Amina', class: '7A', term: 'Term 1', year: '2026', scores: { hisabati: 80 } });
  });

  const adminDb = env.authenticatedContext('admin1').firestore();
  const teacherDb = env.authenticatedContext('teacher1').firestore();
  const teacherBDb = env.authenticatedContext('teacherB').firestore();
  const anonDb = env.unauthenticatedContext().firestore();

  console.log('--- 1. Unauthenticated access ---');
  await t('anon CANNOT read students', () => assertFails(getDocs(collection(anonDb, 'schools/schA/students'))));
  await t('anon CANNOT read join code', () => assertFails(getDoc(doc(anonDb, 'joinCodes/AAAAAA'))));
  await t('anon CANNOT write a student', () => assertFails(setDoc(doc(anonDb, 'schools/schA/students/stuX'), { name: 'X' })));
  await t('anon CANNOT read user profiles', () => assertFails(getDoc(doc(anonDb, 'users/admin1'))));

  console.log('--- 2. Multi-tenant isolation ---');
  await t('teacher of schB CANNOT read schA students', () => assertFails(getDocs(collection(teacherBDb, 'schools/schA/students'))));
  await t('teacher of schB CANNOT write schA student', () => assertFails(setDoc(doc(teacherBDb, 'schools/schA/students/stuY'), { name: 'Y' })));
  await t('teacher of schB CAN read own school students', () => assertSucceeds(getDocs(collection(teacherBDb, 'schools/schB/students'))));
  await t('admin1 CANNOT delete student of schB', () => assertFails(deleteDoc(doc(adminDb, 'schools/schB/students/stuZ'))));
  await t('admin1 CANNOT update settings of schB', () => assertFails(updateDoc(doc(adminDb, 'schools/schB'), { year: '2030' })));

  console.log('--- 3. Teacher capabilities ---');
  await t('teacher CAN create student in own school', () => assertSucceeds(setDoc(doc(teacherDb, 'schools/schA/students/stuT'), { name: 'T', class: '7A', term: 'Term 1', year: '2026', scores: {} })));
  await t('teacher CAN edit scores', () => assertSucceeds(updateDoc(doc(teacherDb, 'schools/schA/students/stu1'), { 'scores.hisabati': 90 })));
  await t('teacher CANNOT delete a student', () => assertFails(deleteDoc(doc(teacherDb, 'schools/schA/students/stu1'))));
  await t('teacher CANNOT clear all students (delete forbidden)', () => assertFails(deleteDoc(doc(teacherDb, 'schools/schA/students/stuT'))));
  await t('teacher CANNOT update school settings', () => assertFails(updateDoc(doc(teacherDb, 'schools/schA'), { year: '2030' })));
  await t('teacher CAN update own fullName', () => assertSucceeds(updateDoc(doc(teacherDb, 'users/teacher1'), { fullName: 'New Name' })));
  await t('teacher CANNOT self-promote to admin', () => assertFails(updateDoc(doc(teacherDb, 'users/teacher1'), { role: 'admin' })));
  await t('teacher CANNOT list user profiles at all', () => assertFails(getDocs(query(collection(teacherDb, 'users'), where('schoolId', '==', 'schA')))));

  console.log('--- 4. Admin capabilities ---');
  await t('admin CAN delete a student', () => assertSucceeds(deleteDoc(doc(adminDb, 'schools/schA/students/stuT'))));
  await t('admin CAN update school settings', () => assertSucceeds(updateDoc(doc(adminDb, 'schools/schA'), { year: '2030' })));
  await t('admin CAN change role within own school', () => assertSucceeds(updateDoc(doc(adminDb, 'users/teacher1'), { role: 'teacher' })));
  await t('admin CANNOT change role of other-school user', () => assertFails(updateDoc(doc(adminDb, 'users/teacherB'), { role: 'teacher' })));
  await t('admin user list MUST filter own school (unfiltered query denied)', () => assertFails(getDocs(collection(adminDb, 'users'))));
  await t('admin user list filtered to own school works', () => assertSucceeds(getDocs(query(collection(adminDb, 'users'), where('schoolId', '==', 'schA')))));
  await t('admin user list filtered to OTHER school denied', () => assertFails(getDocs(query(collection(adminDb, 'users'), where('schoolId', '==', 'schB')))));
  await t('admin CANNOT delete own account', () => assertFails(deleteDoc(doc(adminDb, 'users/admin1'))));
  await t('admin CAN remove teacher from own school', () => assertSucceeds(deleteDoc(doc(adminDb, 'users/teacher1'))));
  // restore teacher1 for later tests
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'users/teacher1'), { fullName: 'Teacher One', email: 't@a.tz', role: 'teacher', schoolId: 'schA', joinCode: 'AAAAAA' });
  });

  console.log('--- 5. Privilege escalation at signup ---');
  const evil1 = env.authenticatedContext('evil1').firestore();
  const evil2 = env.authenticatedContext('evil2').firestore();
  await t('new user CANNOT claim admin of an existing school', () => assertFails(setDoc(doc(evil1, 'users/evil1'), { fullName: 'Evil', email: 'e@e.tz', role: 'admin', schoolId: 'schA' })));
  await t('new user CANNOT claim teacher of school whose code they lack', () => assertFails(setDoc(doc(evil2, 'users/evil2'), { fullName: 'Bad', email: 'x@x.tz', role: 'teacher', schoolId: 'schB', joinCode: 'AAAAAA' })));
  await t('new user CAN join as teacher with a VALID code for that school', () => assertSucceeds(setDoc(doc(evil1, 'users/evil1'), { fullName: 'New Teacher', email: 'n@n.tz', role: 'teacher', schoolId: 'schA', joinCode: 'AAAAAA' })));
  await t('joined teacher CANNOT later rewrite joinCode/role', () => assertFails(updateDoc(doc(evil1, 'users/evil1'), { role: 'admin', joinCode: 'BBBBBB' })));

  console.log('--- 6. New school (admin signup path) ---');
  const newAdmin = env.authenticatedContext('newAdmin').firestore();
  await t('new user CAN create own school', () => assertSucceeds(setDoc(doc(newAdmin, 'schools/schNEW'), { name: 'Shule New', createdBy: 'newAdmin' })));
  await t('new user CAN create own admin profile for school they created', () => assertSucceeds(setDoc(doc(newAdmin, 'users/newAdmin'), { fullName: 'NA', email: 'na@n.tz', role: 'admin', schoolId: 'schNEW' })));
  await t('other user CANNOT create profile claiming that new school', () => assertFails(setDoc(doc(env.authenticatedContext('evil3').firestore(), 'users/evil3'), { fullName: 'E3', email: 'e3@e.tz', role: 'admin', schoolId: 'schNEW' })));

  console.log('--- 7. Join codes ---');
  await t('any signed-in user CAN look up one join code (needed to join)', () => assertSucceeds(getDoc(doc(evil2, 'joinCodes/AAAAAA'))));
  await t('teacher CANNOT create join codes', () => assertFails(setDoc(doc(teacherDb, 'joinCodes/NEWCDE'), { schoolId: 'schA', createdBy: 'teacher1' })));
  await t('admin CAN create join code for own school', () => assertSucceeds(setDoc(doc(adminDb, 'joinCodes/NEWCDE'), { schoolId: 'schA', createdBy: 'admin1' })));
  await t('admin CANNOT create join code for OTHER school', () => assertFails(setDoc(doc(adminDb, 'joinCodes/NEWCD2'), { schoolId: 'schB', createdBy: 'admin1' })));

  await env.cleanup();
  console.log('\n==============================');
  console.log('RULES TESTS  PASSED: ' + passed + '   FAILED: ' + failed);
  if (failed) { console.log(failures.join('\n')); process.exit(1); }
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
