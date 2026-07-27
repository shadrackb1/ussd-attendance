require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeFirestore } = require('./db/firestore');

// Initialize Firestore
initializeFirestore();

const authRoutes = require('./routes/auth');
const unitRoutes = require('./routes/units');
const sessionRoutes = require('./routes/sessions');
const studentRoutes = require('./routes/students');
const ussdRoutes = require('./routes/ussd');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/auth', authRoutes);
app.use('/units', unitRoutes);
app.use('/sessions', sessionRoutes);
app.use('/students', studentRoutes);
app.use('/ussd', ussdRoutes);

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`USSD Attendance server running on port ${PORT}`);
  });
}

module.exports = app;
