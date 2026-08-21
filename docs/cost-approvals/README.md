# Founder Cost Approvals

This directory is the cryptographic boundary for `scripts/cost-guard.mjs`.
The guard reads approval artifacts and one Ed25519 public key. It never writes
an approval or generates founder key material.

## Repository Files

- `founder-cost-approval-public-key.pem`: founder-installed Ed25519 public key;
- `<approval-id>.json`: signed artifact containing `payload` and base64 signature.

No real private key, seed, passphrase, unsigned approval, or signing utility
configured with the private-key location may enter the repository or any agent
environment. Until the public key is installed, approval-required actions fail
closed. The self-test creates an ephemeral TEST-ONLY key pair in process memory
and writes neither key to disk.

## Signed Shape

```json
{
  "payload": {
    "approvalId": "APPROVAL-2026-001",
    "maximumAmountUsd": 12,
    "maximumUses": 1,
    "kind": "one-time",
    "provider": "example",
    "purpose": "approved operation",
    "taskId": "CX1-COST",
    "expiresAt": "2026-08-17T00:00:00Z",
    "founderApproved": true,
    "nonce": "founder-generated-unique-random-value",
    "version": 1
  },
  "signature": "BASE64_ED25519_SIGNATURE"
}
```

`taskId` is optional. Every other shown payload field is required. An optional
signed project budget window has this shape:

```json
"projectBudgetPeriod": {
  "id": "2026-Q3-founder-budget",
  "startsAt": "2026-07-01T00:00:00Z",
  "endsAt": "2026-10-01T00:00:00Z",
  "maximumAmountUsd": 50
}
```

The signed bytes are UTF-8 canonical JSON: object keys sorted lexicographically
at every depth, no whitespace, arrays kept in order, and ordinary JSON scalar
encoding. The signature covers the `payload` object only. The guard also checks
provider, purpose, kind, optional task, expiry, cumulative amount, and use count.

## Founder-Only Setup

Perform these steps on a separate founder-controlled machine or signing device
that Codex and other coding agents cannot access. Do not run private-key
commands in this repository or in an agent-visible terminal.

1. Generate the private key externally:

```powershell
openssl genpkey -algorithm ED25519 -out founder-cost-approval-private.pem
```

2. Export only the public key:

```powershell
openssl pkey -in founder-cost-approval-private.pem -pubout -out founder-cost-approval-public-key.pem
```

3. Manually place only `founder-cost-approval-public-key.pem` in this directory.
   Keep the private key external and access-controlled.

4. On the founder-controlled machine, create `sign-cost-approval.mjs` with this
   exact implementation. It uses the same canonicalization as the verifier:

```javascript
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const canonicalize = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`unsupported ${typeof value}`);
};

const [payloadPath, privateKeyPath, outputPath] = process.argv.slice(2);
if (!payloadPath || !privateKeyPath || !outputPath) {
  throw new Error('usage: node sign-cost-approval.mjs PAYLOAD PRIVATE_KEY OUTPUT');
}
const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
const privateKey = createPrivateKey(readFileSync(privateKeyPath));
const signature = sign(null, Buffer.from(canonicalize(payload)), privateKey).toString('base64');
writeFileSync(outputPath, `${JSON.stringify({ payload, signature }, null, 2)}\n`, { flag: 'wx' });
```

5. Create a payload-only JSON file, use a fresh unpredictable nonce, then sign:

```powershell
node .\sign-cost-approval.mjs .\payload.json .\founder-cost-approval-private.pem .\APPROVAL-2026-001.json
```

6. Transfer only the signed approval JSON into this directory. Confirm its
   filename exactly matches `payload.approvalId + ".json"`.

Never reuse a nonce, backdate expiry, increase an existing signed artifact, or
let the signing private key enter the agent-accessible machine.
