# USSD Attendance

<img src="./assets/header.svg" width="100%" alt="USSD Attendance — any phone. No app, no camera, no data bundle." />

Check-in over USSD. Any handset. No app install, no camera, no data bundle.

**Hard constraint it answers:** feature phones and dead bundles. QR attendance assumes a working smartphone with a camera and a live connection. That is not the default in many Kenyan campuses and training sites. USSD already runs M-Pesa. This rides the same channel.

## Flow

1. Lecturer opens a session and a short code is issued.
2. Student dials the USSD string on any handset, smartphone or not.
3. Server verifies enrollment and session state, then writes attendance.
4. Lecturer dashboard updates on the next poll.

```text
dial  *384#  →  pick session  →  confirm  →  recorded
```

A browser mock of that menu lives at [playground → USSD simulator](https://shadrackb1.github.io/playground/ussd.html).

## Security

JWT on lecturer and admin APIs. bcrypt for credentials. Enrollment checks run before every write. The gateway endpoint is rate-limited so a single IMEI cannot flood a session.

## Stack

Node.js · Express 5 · PostgreSQL (`pg`) · Firebase Admin · JSON Web Tokens · bcrypt · Node's built-in test runner.

## Run locally

```bash
npm install
cp .env.example .env
npm run migrate
npm run dev
npm test
```

`npm start` runs the production server. `npm run migrate:down` rolls back the last migration.

## Links

- Repo: https://github.com/shadrackb1/ussd-attendance
- Related: [KSAS](https://github.com/shadrackb1/KSAS) for campuses where phones can scan QR
- Live mock: [USSD simulator](https://shadrackb1.github.io/playground/ussd.html)

## License

ISC
