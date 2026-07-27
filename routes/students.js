const express = require('express');
const { collections } = require('../db/firestore');
const { sendOTP, generateOTP } = require('../services/sms');

const router = express.Router();

const otpStore = new Map();

router.post('/register', async (req, res) => {
  try {
    const { name, student_id, phone_number } = req.body;
    if (!name || !student_id || !phone_number) {
      return res.status(400).json({ error: 'name, student_id, and phone_number are required' });
    }

    const normalizedPhone = phone_number.startsWith('+') ? phone_number : '+' + phone_number;

    // Check for existing student
    const existingSid = await collections.students.where('student_id', '==', student_id).get();
    const existingPhone = await collections.students.where('phone_number', '==', normalizedPhone).get();
    if (!existingSid.empty || !existingPhone.empty) {
      return res.status(409).json({ error: 'Student ID or phone number already registered' });
    }

    const docRef = await collections.students.add({
      name, student_id, phone_number: normalizedPhone, phone_verified: false,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({
      student: { id: docRef.id, name, student_id, phone_number: normalizedPhone, phone_verified: false },
      message: 'Student registered. Please verify phone number.',
    });
  } catch (err) {
    console.error('Register student error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/request-otp', async (req, res) => {
  try {
    const { phone_number } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'phone_number is required' });

    const normalizedPhone = phone_number.startsWith('+') ? phone_number : '+' + phone_number;

    const snapshot = await collections.students.where('phone_number', '==', normalizedPhone).limit(1).get();
    if (snapshot.empty) return res.status(404).json({ error: 'Phone number not registered' });

    const student = snapshot.docs[0].data();
    if (student.phone_verified) return res.status(400).json({ error: 'Phone already verified' });

    const otp = generateOTP();
    otpStore.set(normalizedPhone, { otp, expiresAt: Date.now() + 10 * 60 * 1000, studentId: snapshot.docs[0].id });

    try { await sendOTP(normalizedPhone, otp); }
    catch (smsErr) { console.error('SMS send failed:', smsErr.message); }

    res.json({ message: 'OTP sent to your phone number' });
  } catch (err) {
    console.error('Request OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { phone_number, otp } = req.body;
    if (!phone_number || !otp) return res.status(400).json({ error: 'phone_number and otp are required' });

    const normalizedPhone = phone_number.startsWith('+') ? phone_number : '+' + phone_number;
    const stored = otpStore.get(normalizedPhone);

    if (!stored) return res.status(400).json({ error: 'No OTP request found. Request a new one.' });
    if (Date.now() > stored.expiresAt) { otpStore.delete(normalizedPhone); return res.status(400).json({ error: 'OTP expired. Request a new one.' }); }
    if (stored.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });

    await collections.students.doc(stored.studentId).update({ phone_verified: true });
    otpStore.delete(normalizedPhone);
    res.json({ message: 'Phone number verified successfully' });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
