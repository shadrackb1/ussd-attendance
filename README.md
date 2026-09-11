# USSD Attendance

<img src="./assets/header.svg" width="100%" alt="USSD Attendance" />

Check-in over USSD. Any phone. No app, no camera, no data bundle.

## Why this exists

QR attendance assumes everyone has a working smartphone and data. That is not the default in many Kenyan campuses and training sites. USSD already works for banking. This uses the same channel.

## Flow

1. Lecturer opens a session. A short code is issued.
2. Student dials the USSD string on any handset.
3. Server verifies enrollment and session state, then records attendance.
4. Lecturer dashboard updates.

## Security

JWT for lecturer and admin APIs, bcrypt for credentials, enrollment checks before write, rate limits on the gateway endpoint.

## Stack

Node.js, Express 5, PostgreSQL, Firebase Admin, JWT, bcrypt.

## Run locally

    npm install
    cp .env.example .env
    npm run migrate
    npm run dev
    npm test

## License

ISC
