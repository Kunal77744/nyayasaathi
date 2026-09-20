# NyayaSaathi (न्यायसाथी)

A GenAI assistant that helps ordinary people **understand, compare and question legal documents**, such as rent agreements, job offers, loan agreements and NDAs, in plain English or Hindi.

> **Information, not legal advice.** NyayaSaathi explains what a document says and where the risks are. It never tells the user whether to sign, and every screen carries a disclaimer.

Built for PromptWars Virtual: *AI for Legal Assistance & Access*.

## What it does

| Need from the problem statement | Feature |
|---|---|
| Simplify complex documents | Plain-language summary and key facts (parties, money, dates, notice period) |
| Highlight clauses, obligations, risks, inconsistencies | Clause flags labelled **High / Medium / Low risk**, plus a "contradictions inside the document" section |
| Compare contracts or versions | Side-by-side table of differences, which side carries more risk, and clauses that appear in only one document |
| Answer questions from the document | "Ask a question" box; answers use only the document and show the supporting quote, or say the document does not answer |
| Options and next steps | Checklist to work through before agreeing |
| Prepare for a legal professional | "Questions to ask a lawyer" generated from the document, with a copy button |
| Accessibility for Hindi speakers | Answers in English or Hindi (Devanagari), chosen with one toggle |

Input can be pasted text or an uploaded PDF or TXT file. Two sample rent agreements are built in so the app can be tried in seconds.

## Gen AI usage

Google **Gemini API** (called from the server, never from the browser) is used for:

1. Summarising a document and extracting key facts
2. Clause-level risk flagging with severity, explanation and a suggested clarification
3. Detecting contradictions within a document
4. Comparing two documents or versions
5. Answering questions grounded in the document, with a supporting quote
6. Generating checklists and lawyer questions
7. Writing all of the above in English or Hindi

Prompts (`server/prompts.js`) require JSON output, forbid "you should sign" verdicts, forbid inventing clauses or laws, and treat document text as untrusted data. Model output is then validated and reshaped (`server/normalize.js`), so a malformed reply can never break the page.

## Architecture

```
public/            static front end (HTML, CSS, vanilla JS; no build step)
server/
  app.js           Express app: routes, security middleware, error handling
  llm.js           Gemini REST client with model fallback, retry and timeout
  prompts.js       prompt builders
  normalize.js     validates and shapes model output
  validate.js      input validation
  extract.js       PDF/TXT text extraction
  cache.js         in-memory cache for repeated requests
tests/             43 automated tests (node:test)
```

One Node service serves both the API and the front end, so deployment is a single step and there are no CORS issues.

## Run locally

Requires Node 20.16+ (or 22.3+).

```bash
git clone <this repo>
cd nyayasaathi
npm install
cp .env.example .env        # then put your Gemini key in .env
npm run check-llm           # optional: confirms the key and model work
npm start                   # http://localhost:3000
```

Get a free key at <https://aistudio.google.com/apikey>. `GEMINI_MODEL` is optional; if the preferred model is unavailable the server falls back to other Gemini Flash models automatically.

## Tests

```bash
npm test
```

Covers input validation, output normalisation, the Gemini client (fallback, retry, invalid key, rate limit, blocked content), all API routes with a fake AI, real PDF parsing, upload rejection, caching, rate limiting, security headers, prompt-injection handling and basic page accessibility. No API key is needed to run the tests.

## Security

- The API key lives only in the server environment (`.env` is git-ignored) and is sent in a request header, never in a URL.
- `helmet` security headers with a strict Content-Security-Policy (no inline scripts).
- Rate limiting on all API routes; JSON body limit; document length limit; 5 MB upload limit with file type decided by content, not by file name.
- Uploaded files are processed in memory and never written to disk. Documents are not stored.
- The front end renders all AI output as text (never as HTML), which prevents script injection.
- Document text is delimited and labelled as untrusted data in prompts to resist prompt injection.
- Error messages are user-safe; stack traces and document text are never returned or logged.

## Accessibility

- Semantic landmarks, a skip link, one `h1`, logical heading order
- Keyboard-operable tabs (arrow keys, Home, End) and visible focus indicators
- Every input has a visible label; progress and errors are announced through live regions
- Risk levels use a **text label and a distinct shape**, never colour alone
- Colours meet WCAG AA contrast; layout works on small screens; reduced-motion respected
- Content in Hindi is marked with `lang="hi"` so screen readers pronounce it correctly

## Deploy (Render, free tier)

1. Push this repo to GitHub (public).
2. On Render choose **New → Blueprint** and select the repo (`render.yaml` is included), or create a Web Service with build command `npm ci --omit=dev` and start command `npm start`.
3. Add the environment variable `GEMINI_API_KEY`.
4. Open `/api/health`: it should show `"aiConfigured": true`.

Free instances sleep when idle, so the first request after a pause can take about 30 seconds.

## Limitations

- Scanned PDFs (images without text) are not supported; paste the text instead.
- Documents are limited to 40,000 characters each.
- The AI can make mistakes. Output is a starting point for understanding a document, not a legal opinion.

## Licence

MIT
