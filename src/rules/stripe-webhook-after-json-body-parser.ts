import type { Rule, Finding, ScannedFile } from '../types.js';

/**
 * Rule: Stripe webhook route registered after global express.json() middleware
 * Severity: HIGH
 *
 * express.json() consumes the request body stream. If it runs before the raw
 * body parser on the /webhook/stripe route, Stripe's signature verification
 * always fails because `req.body` is already a parsed object, not the original
 * bytes.
 */
export const stripeWebhookAfterJsonBodyParser: Rule = {
  id: 'stripe-webhook-after-json-body-parser',
  severity: 'high',
  title: 'Stripe webhook registered after global express.json() — signature verification will fail',
  description: `express.json() (body-parser) consumes the raw request body before Stripe can verify the signature.
If app.use(express.json()) appears before the Stripe webhook route with express.raw(...), the raw bytes are gone → constructEvent() always throws a signature mismatch.`,

  check(files: ScannedFile[]): Finding[] {
    const findings: Finding[] = [];

    for (const file of files) {
      const c = file.content;
      const lines = file.lines;

      // Must be an Express file that has both express.json() and a stripe webhook route
      if (!(/express\(\)/.test(c) || /require\(['"]express['"]\)/.test(c) || /from ['"]express['"]/.test(c))) {
        continue;
      }
      if (!/stripe/i.test(c) && !/webhook/i.test(c)) {
        continue;
      }

      let jsonParserLine = -1;
      let stripeWebhookLine = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (jsonParserLine === -1 && /app\.(use|all)\s*\(.*express\.json\s*\(/.test(line)) {
          jsonParserLine = i + 1;
        }
        if (
          stripeWebhookLine === -1 &&
          (
            /['"\/].*webhook.*stripe/.test(line) ||
            /['"\/].*stripe.*webhook/.test(line)
          ) &&
          /app\.(post|use|all)\s*\(/.test(line)
        ) {
          stripeWebhookLine = i + 1;
        }
      }

      if (jsonParserLine > 0 && stripeWebhookLine > 0 && jsonParserLine < stripeWebhookLine) {
        findings.push({
          ruleId: 'stripe-webhook-after-json-body-parser',
          severity: 'high',
          title: 'Stripe webhook registered after global express.json() — signature verification will fail',
          why: `app.use(express.json()) at line ${jsonParserLine} runs BEFORE the Stripe webhook route at line ${stripeWebhookLine}.
express.json() consumes the raw request body stream. By the time Stripe's webhook handler runs, req.body is already a parsed JS object — stripe.webhooks.constructEvent() needs the original raw bytes and will always throw a signature mismatch.`,
          fix: [
            `Move the Stripe webhook route BEFORE app.use(express.json()) in your app setup.`,
            `Or use express.raw({ type: 'application/json' }) only on the /webhook/stripe path: app.use('/webhook/stripe', express.raw({ type: 'application/json' })) — before the global JSON parser.`,
            `Or add a verify callback to express.json: express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }) and use req.rawBody in the webhook handler.`,
          ],
          references: [
            'https://stripe.com/docs/webhooks/signatures#verify-official-libraries',
            'https://github.com/stripe/stripe-node#webhook-signing',
            'https://github.com/exisz/dr-agent',
          ],
          file: file.path,
          line: stripeWebhookLine,
        });
      }
    }

    return findings;
  },
};
