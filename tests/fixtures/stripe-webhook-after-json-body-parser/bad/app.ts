// BAD: express.json() registered before Stripe webhook route
// dr-agent should flag: stripe-webhook-after-json-body-parser

import express from 'express';
import Stripe from 'stripe';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// BAD: global json parser runs first
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// BAD: Stripe webhook registered after express.json() — raw body already consumed
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']!;
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err}`); // always fails
  }
  res.json({ received: true });
});

app.listen(3000);
