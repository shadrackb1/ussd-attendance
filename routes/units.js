const express = require('express');
const { collections } = require('../db/firestore');
const { authenticateToken } = require('../services/auth');

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const existing = await collections.units.where('code', '==', code).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Unit code already exists' });
    }

    const docRef = await collections.units.add({
      name, code, lecturer_id: req.lecturer.id, created_at: new Date().toISOString(),
    });

    res.status(201).json({ unit: { id: docRef.id, name, code, created_at: new Date().toISOString() } });
  } catch (err) {
    console.error('Create unit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const snapshot = await collections.units.where('lecturer_id', '==', req.lecturer.id).get();
    const units = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    units.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json({ units });
  } catch (err) {
    console.error('List units error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
