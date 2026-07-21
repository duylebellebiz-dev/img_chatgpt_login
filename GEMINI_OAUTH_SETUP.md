# Gemini OAuth image setup

NailSocial generates and edits images by spawning the locally installed Google
Antigravity CLI (`agy`). It uses the OAuth session stored by Antigravity in
Windows Credential Manager. No ChatGPT login, OAuth proxy, or Gemini API key is
required for image generation.

## 1. Install and authenticate Antigravity CLI

In PowerShell:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
agy
```

Complete Google sign-in in the browser. Verify the installation in a new
PowerShell window:

```powershell
agy --version
agy models
```

## 2. Backend configuration

Add these values to `backend/.env`:

```env
IMAGE_PROVIDER=agy
AGY_BIN=C:\Users\YOUR_USERNAME\AppData\Local\agy\bin\agy.exe
AGY_IMAGE_MODEL=nano-banana-2
AGY_MODEL=gemini-3.1-pro-high
AGY_GENERATION_TIMEOUT_SECONDS=400
```

`AGY_MODEL` picks the orchestrator model the CLI runs as when it calls the
image-generation tool (run `agy models` to see the current list). It affects
how precisely the compositing instructions are followed, not which model
actually renders the pixels — that's fixed inside Antigravity's image tool.

`ANTHROPIC_API_KEY` remains optional for prompt building and quality scoring.
It is unrelated to image-provider authentication.

## 3. Run NailSocial

Backend:

```powershell
cd E:\img_chatgpt\backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend, in a second PowerShell window:

```powershell
cd E:\img_chatgpt\frontend
npm run dev
```

Open <http://localhost:5173>.

The Antigravity CLI does not need to remain open. The backend starts `agy -p`
for each image request and reuses the OAuth credentials saved during sign-in.
