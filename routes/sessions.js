const express = require('express');
const { collections } = require('../db/firestore');
const { authenticateToken } = require('../services/auth');

const router = express.Router();

function generateSessionCode() {
  const digits = 4 + Math.floor(Math.random() * 3);
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { unit_id } = req.body;
    if (!unit_id) return res.status(400).json({ error: 'unit_id is required' });

    const unitDoc = await collections.units.doc(unit_id).get();
    if (!unitDoc.exists || unitDoc.data().lecturer_id !== req.lecturer.id) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    // Deactivate existing active sessions for this unit
    const activeSessions = await collections.sessions
      .where('unit_id', '==', unit_id).where('is_active', '==', true).get();
    const batch = require('../db/firestore').getDb().batch();
    activeSessions.forEach(doc => batch.update(doc.ref, { is_active: false }));
    await batch.commit();

    // Generate unique session code
    let sessionCode;
    let isUnique = false;
    while (!isUnique) {
      sessionCode = generateSessionCode();
      const existing = await collections.sessions
        .where('session_code', '==', sessionCode).where('is_active', '==', true).get();
      isUnique = existing.empty;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    const docRef = await collections.sessions.add({
      unit_id,
      session_code: sessionCode,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      is_active: true,
    });

    res.status(201).json({
      session: {
        id: docRef.id, unit_id, session_code: sessionCode,
        created_at: now.toISOString(), expires_at: expiresAt.toISOString(), is_active: true,
      },
      unit_name: unitDoc.data().name,
      display_code: sessionCode,
      message: `Session active. Display code: ${sessionCode}`,
      expires_in: '15 minutes',
    });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/unit/:unitId', authenticateToken, async (req, res) => {
  try {
    const { unitId } = req.params;
    const unitDoc = await collections.units.doc(unitId).get();
    if (!unitDoc.exists || unitDoc.data().lecturer_id !== req.lecturer.id) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const snapshot = await collections.sessions
      .where('unit_id', '==', unitId)
      .orderBy('created_at', 'desc').limit(50).get();

    const sessions = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const attSnapshot = await collections.attendanceRecords
        .where('session_id', '==', doc.id).get();
      sessions.push({ id: doc.id, ...data, attendance_count: attSnapshot.size });
    }

    res.json({ sessions });
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/attendance', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const sessionDoc = await collections.sessions.doc(id).get();
    if (!sessionDoc.exists) return res.status(404).json({ error: 'Session not found' });

    const sessionData = sessionDoc.data();
    const unitDoc = await collections.units.doc(sessionData.unit_id).get();
    if (!unitDoc.exists || unitDoc.data().lecturer_id !== req.lecturer.id) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const attSnapshot = await collections.attendanceRecords
      .where('session_id', '==', id).get();

    const attendance = [];
    for (const doc of attSnapshot.docs) {
      const record = doc.data();
      const studentDoc = await collections.students.doc(record.student_id).get();
      if (studentDoc.exists) {
        const student = studentDoc.data();
        attendance.push({
          id: doc.id,
          signed_in_at: record.signed_in_at,
          name: student.name,
          student_id: student.student_id,
          phone_number: student.phone_number,
        });
      }
    }

    attendance.sort((a, b) => (a.signed_in_at || '').localeCompare(b.signed_in_at || ''));
    res.json({ session_id: id, total_signed_in: attendance.length, attendance });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
