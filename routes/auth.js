const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { collections } = require('../db/firestore');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = await collections.lecturers.where('email', '==', email).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const docRef = await collections.lecturers.add({
      name, email, password_hash: passwordHash, created_at: new Date().toISOString(),
    });

    const token = jwt.sign({ id: docRef.id, email }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.status(201).json({ lecturer: { id: docRef.id, name, email }, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const snapshot = await collections.lecturers.where('email', '==', email).limit(1).get();
    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const doc = snapshot.docs[0];
    const lecturer = doc.data();
    const valid = await bcrypt.compare(password, lecturer.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: doc.id, email }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ lecturer: { id: doc.id, name: lecturer.name, email: lecturer.email }, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
