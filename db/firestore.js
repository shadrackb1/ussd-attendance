const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db;

function initializeFirestore() {
  if (db) return db;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    const app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    db = getFirestore(app, 'default');
    console.log('Firestore initialized with service account');
  } else {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    const app = initializeApp({ projectId: 'ussd-attendance-dev' });
    db = getFirestore(app);
    console.log('Firestore initialized with emulator (127.0.0.1:8080)');
  }

  return db;
}

function getDb() {
  if (!db) initializeFirestore();
  return db;
}

const collections = {
  get lecturers() { return getDb().collection('lecturers'); },
  get units() { return getDb().collection('units'); },
  get sessions() { return getDb().collection('sessions'); },
  get students() { return getDb().collection('students'); },
  get attendanceRecords() { return getDb().collection('attendance_records'); },
};

module.exports = { initializeFirestore, getDb, collections };
