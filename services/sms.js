const AT_API_URL = 'https://api.africastalking.com/version1/messaging';

async function sendOTP(phoneNumber, otp) {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME;

  const params = new URLSearchParams();
  params.append('username', username);
  params.append('to', phoneNumber);
  params.append('message', `Your verification code is: ${otp}. Valid for 10 minutes.`);

  const response = await fetch(AT_API_URL, {
    method: 'POST',
    headers: {
      apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (data.SMSMessageData && data.SMSMessageData.Recipients) {
    const failed = data.SMSMessageData.Recipients.filter(
      (r) => r.status !== 'Success'
    );
    if (failed.length > 0) {
      console.error('SMS send failures:', failed);
    }
  }

  return data;
}

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

module.exports = { sendOTP, generateOTP };
