// In-memory rate limiter: { phoneNumber: [{ timestamp, success }] }
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

function cleanOldAttempts(phoneNumber) {
  const now = Date.now();
  const record = attempts.get(phoneNumber);
  if (!record) return;
  const filtered = record.filter((a) => now - a.timestamp < WINDOW_MS);
  if (filtered.length === 0) {
    attempts.delete(phoneNumber);
  } else {
    attempts.set(phoneNumber, filtered);
  }
}

function recordAttempt(phoneNumber, success) {
  cleanOldAttempts(phoneNumber);
  if (success) {
    // Successful attempt resets the failure counter
    attempts.delete(phoneNumber);
    return;
  }
  const record = attempts.get(phoneNumber) || [];
  record.push({ timestamp: Date.now(), success });
  attempts.set(phoneNumber, record);
}

function isRateLimited(phoneNumber) {
  cleanOldAttempts(phoneNumber);
  const record = attempts.get(phoneNumber) || [];
  const failedAttempts = record.filter((a) => !a.success);
  return failedAttempts.length >= MAX_ATTEMPTS;
}

function getAttemptsRemaining(phoneNumber) {
  cleanOldAttempts(phoneNumber);
  const record = attempts.get(phoneNumber) || [];
  const failedAttempts = record.filter((a) => !a.success);
  return Math.max(0, MAX_ATTEMPTS - failedAttempts.length);
}

module.exports = { recordAttempt, isRateLimited, getAttemptsRemaining };
