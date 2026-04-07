# BitGet — API Key Setup

[Sign up for BitGet here](https://partner.bitget.com/bg/LewisJackson) — $1,000 bonus on your first deposit.

## What you'll get
- API Key
- Secret Key
- Passphrase (you create this yourself)

---

## Steps

1. Log into your BitGet account at bitget.com
2. Click your profile icon (top right) → **API Management**
3. Click **Create API**

### Fill in the details

- **API Name** — give it a label like `claude-trading`
- **Passphrase** — create a passphrase yourself. This is not your account password — it's a separate phrase just for this API key. Write it down immediately. You cannot recover it later.
- **IP Whitelist** — ON ✓
  - Google "what is my IP address", copy it, paste it in
- **Permissions:**
  - **Read** — ON ✓
  - **Trade** — ON ✓
  - **Withdrawals** — **OFF** — never turn this on

4. Click **Next** and complete your 2FA verification

### Copy your credentials

You'll see your **API Key** and **Secret Key** on screen.

> ⚠️ The Secret Key is only shown once. Copy it immediately and save it somewhere safe. If you lose it, you'll need to delete this key and create a new one.

---

## Paste into your .env

```
BITGET_API_KEY=your_api_key_here
BITGET_SECRET_KEY=your_secret_key_here
BITGET_PASSPHRASE=your_passphrase_here
```

Set `TRADE_MODE=spot` for spot trading or `TRADE_MODE=futures` for perpetuals.

---

## Notes

- BitGet is used in the video tutorial — the bot's default configuration is built for BitGet
- If you're using a futures account, set `TRADE_MODE=futures` in your `.env`
