# ChatGPT OAuth image setup

The NailSocial backend now generates and edits images through the local OAuth
proxy bundled in `ima2-gen`. It no longer calls the Gemini API.

## One-time setup

From PowerShell:

```powershell
cd E:\img_chatgpt\ima2-gen
npm install
npm run setup
```

Choose **GPT OAuth** and complete the ChatGPT browser login. The login token is
kept by Codex/ima2-gen on this computer; do not commit or copy its auth file.

## Start the apps

Keep the OAuth proxy running in one terminal:

```powershell
cd E:\img_chatgpt\ima2-gen
npm start
```

Then start the NailSocial backend and frontend as usual. The backend calls
`http://127.0.0.1:10531/v1/responses` by default.

Relevant backend environment variables:

```dotenv
IMAGE_PROVIDER=chatgpt_oauth
CHATGPT_OAUTH_PROXY_URL=http://127.0.0.1:10531
CHATGPT_IMAGE_MODEL=gpt-5.4-mini
CHATGPT_IMAGE_QUALITY=high
CHATGPT_IMAGE_MODERATION=low
CHATGPT_REASONING_EFFORT=none
CHATGPT_GENERATION_TIMEOUT_SECONDS=400
```

Use `IMAGE_PROVIDER=mock` for offline development and automated tests.

## Facebook/Instagram OAuth tunnel (ngrok)

The frontend dev server only accepts requests from the reserved domain
`resurrect-unseated-prissy.ngrok-free.dev` (see `allowedHosts` in
`frontend/vite.config.js`), so every machine — Windows or macOS — must expose
port 5173 through *that same* domain. Nothing in the code needs to change per
machine:

1. Install the ngrok CLI (one-time, per machine):
   - macOS: `brew install ngrok/ngrok/ngrok`
   - Windows: https://ngrok.com/download (or keep using the bundled `ngrok.exe`)
2. Authenticate with the shared account (one-time, per machine): ask for the
   authtoken and run `ngrok config add-authtoken <TOKEN>`.
3. From `frontend/`, run:
   ```
   npm run tunnel
   ```
   This always opens `https://resurrect-unseated-prissy.ngrok-free.dev`, so no
   one needs to edit `vite.config.js` or pick their own domain.

Keep the authtoken out of chat/commits — share it directly (password manager,
1:1 message), not through this repo.

## Security and deployment

This OAuth route is intended for a trusted local workstation. Do not expose
the OAuth proxy publicly or deploy the cached ChatGPT/Codex credentials to a
shared web server. For a public or multi-user deployment, use an officially
supported server-side API credential instead.
