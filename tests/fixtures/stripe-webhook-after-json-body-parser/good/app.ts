// GOOD: Stripe raw body parser registered BEFORE global express.json()
// dr-agent should NOT flag: stripe-webhook-after-json-body-parser

import express from 'express';
import Stripe from 'stripe';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// GOOD: raw parser for webhook route comes first
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']!;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err}`);
  }
  res.json({ received: true });
});

// Global json parser comes after
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(3000);
