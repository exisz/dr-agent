// BAD: X-Logto-Id-Token sent by client but missing from CORS allowedHeaders
// dr-agent should flag: cors-missing-custom-auth-header

// --- client side ---
async function fetchData() {
  const res = await fetch('https://api.example.com/data', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Logto-Id-Token': idToken, // custom header
    },
  });
  return res.json();
}

// --- server side (same repo / monorepo) ---
import cors from 'cors';
import express from 'express';
const app = express();

// BAD: custom auth header not in allowedHeaders list
app.use(cors({
  origin: 'https://app.example.com',
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.listen(3000);
