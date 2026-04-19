// GOOD: X-Logto-Id-Token included in CORS allowedHeaders
// dr-agent should NOT flag: cors-missing-custom-auth-header

// --- client side ---
async function fetchData() {
  const res = await fetch('https://api.example.com/data', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Logto-Id-Token': idToken,
    },
  });
  return res.json();
}

// --- server side ---
import cors from 'cors';
import express from 'express';
const app = express();

// GOOD: custom header listed in allowedHeaders
app.use(cors({
  origin: 'https://app.example.com',
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Logto-Id-Token'],
}));

app.listen(3000);
