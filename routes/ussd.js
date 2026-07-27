const express = require('express');
const { collections } = require('../db/firestore');
const { isRateLimited, recordAttempt } = require('../services/rateLimiter');

const router = express.Router();

router.post('/', async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;
  res.setHeader('Content-Type', 'text/plain');

  const phone = phoneNumber.startsWith('+') ? phoneNumber : '+' + phoneNumber;
  const input = text || '';

  try {
    const response = await handleUssdInput(phone, input, sessionId);
    res.send(response);
  } catch (err) {
    console.error('USSD error:', err);
    res.send('END An error occurred. Please try again later.');
  }
});

async function handleUssdInput(phone, input, sessionId) {
  const parts = input.split('*');

  if (input === '' || parts.length === 0) {
    return 'CON Welcome to Attendance System\n1. Sign Attendance\n2. Check My Status';
  }

  const choice = parts[0];
  switch (choice) {
    case '1': return handleSignAttendance(phone, parts);
    case '2': return handleCheckStatus(phone);
    default: return 'END Invalid option. Please try again.';
  }
}

async function handleSignAttendance(phone, parts) {
  if (parts.length === 1) return 'CON Enter Session Code:';

  if (parts.length === 2) {
    const sessionCode = parts[1].trim();
    if (!/^\d{4,6}$/.test(sessionCode)) return 'END Invalid session code. Must be 4-6 digits.';
    if (isRateLimited(phone)) return 'END Too many failed attempts. Try again in 10 minutes.';

    // Find session by code
    const sessionSnapshot = await collections.sessions
      .where('session_code', '==', sessionCode).limit(1).get();

    if (sessionSnapshot.empty) {
      recordAttempt(phone, false);
      return 'END Invalid session code. Please check the code and try again.';
    }

    const sessionDoc = sessionSnapshot.docs[0];
    const session = sessionDoc.data();

    if (!session.is_active) {
      recordAttempt(phone, false);
      return 'END This session is no longer active. Ask your lecturer for a new code.';
    }

    if (new Date() > new Date(session.expires_at)) {
      recordAttempt(phone, false);
      await collections.sessions.doc(sessionDoc.id).update({ is_active: false });
      return 'END This session has expired. Ask your lecturer for a new code.';
    }

    // Check student
    const studentSnapshot = await collections.students
      .where('phone_number', '==', phone).limit(1).get();

    if (studentSnapshot.empty) {
      recordAttempt(phone, false);
      return 'END Your phone number is not registered. Please register via the web portal first.';
    }

    const studentDoc = studentSnapshot.docs[0];
    const student = studentDoc.data();

    if (!student.phone_verified) {
      recordAttempt(phone, false);
      return 'END Your phone number is not verified. Please verify via the web portal first.';
    }

    // Check duplicate
    const existingRecord = await collections.attendanceRecords
      .where('session_id', '==', sessionDoc.id)
      .where('student_id', '==', studentDoc.id).limit(1).get();

    if (!existingRecord.empty) {
      recordAttempt(phone, false);
      // Get unit name
      const unitDoc = await collections.units.doc(session.unit_id).get();
      const unitName = unitDoc.exists ? unitDoc.data().name : 'this session';
      return `END You have already signed in for ${unitName}.`;
    }

    // Record attendance
    await collections.attendanceRecords.add({
      session_id: sessionDoc.id,
      student_id: studentDoc.id,
      signed_in_at: new Date().toISOString(),
    });

    recordAttempt(phone, true);

    // Get unit name
    const unitDoc = await collections.units.doc(session.unit_id).get();
    const unitName = unitDoc.exists ? unitDoc.data().name : 'your session';

    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `END Attendance recorded for ${unitName} at ${time}. Thank you, ${student.name}!`;
  }

  return 'END Something went wrong. Please start over.';
}

async function handleCheckStatus(phone) {
  const studentSnapshot = await collections.students
    .where('phone_number', '==', phone).limit(1).get();

  if (studentSnapshot.empty) return 'END Your phone number is not registered. Please register via the web portal.';

  const studentDoc = studentSnapshot.docs[0];
  const student = studentDoc.data();

  if (!student.phone_verified) return 'END Your phone number is not verified. Please verify via the web portal.';

  const attSnapshot = await collections.attendanceRecords
    .where('student_id', '==', studentDoc.id)
    .orderBy('signed_in_at', 'desc').limit(5).get();

  if (attSnapshot.empty) return 'END No attendance records found. You haven\'t signed into any sessions yet.';

  let message = `END Your recent attendance (${student.name}):\n`;
  for (const doc of attSnapshot.docs) {
    const record = doc.data();
    const sessionDoc = await collections.sessions.doc(record.session_id).get();
    if (sessionDoc.exists) {
      const session = sessionDoc.data();
      const unitDoc = await collections.units.doc(session.unit_id).get();
      const unitName = unitDoc.exists ? unitDoc.data().name : 'Unknown';
      const date = new Date(record.signed_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const time = new Date(record.signed_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      message += `${unitName} - ${date} ${time}\n`;
    }
  }

  return message.trim();
}

module.exports = router;
