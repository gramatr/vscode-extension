# gramatr — Intelligent AI Routing for VS Code

Pre-classifies every request sent through `@gramatr` via the gramatr decision router before the LLM processes it. Saves tokens and improves response quality by providing effort-level classification, intent detection, and context enrichment.

This extension is closed-source software. It is free to install and use as a client for authenticated gramatr services.

## Usage

1. Install the extension
2. Run `gramatr: Connect Account` or `gramatr: Set API Key`
3. Configure `gramatr.serverUrl` if you are targeting a non-default server
4. Run `gramatr: Start Agent Session` or open Copilot Chat and use `@gramatr`

## Canonical Workflow

- `@gramatr` is the canonical gramatr agent experience in VS Code.
- The extension-owned chat participant is the only supported path for full gramatr workflow enforcement.
- Default Copilot chat outside `@gramatr` is not guaranteed to run authenticated gramatr routing, session continuity, or feedback loops.
- The old markdown-defined repo agent is not part of the supported VS Code workflow.

## Licensing And Service Terms

- This extension is licensed under the proprietary license included in this package.
- The extension is free to install and use as a client application.
- Access to gramatr backend features requires an authenticated account or API key.
- Use of the gramatr backend service is governed separately by gramatr Terms of Service and Privacy Policy.

## Authentication

- Preferred human auth path: `gramatr: Connect Account` opens the Firebase-backed dashboard login
- Dashboard login supports Google and GitHub providers when enabled in Firebase Auth
- API keys are still supported and stored in VS Code Secret Storage by default
- `gramatr.token` remains as a legacy fallback and is auto-migrated into secure storage on activation
- `GRAMATR_TOKEN` still works for local development and CI-style environments
- `gramatr.dashboardUrl` can override the dashboard location used by `gramatr: Connect Account`

## Slash Commands

- `/classify` — Dry-run classification without forwarding to LLM
- `/status` — Show session metrics and classifier stats
- `/mcp-tools` — Show the main gramatr MCP tools and the preferred tool order
- `/rate` — Submit an explicit 1-10 rating for the last classified response
- `/handoff load` — Show the active handoff or reload it from gramatr
- `/handoff save` — Save a structured handoff for the current session
- `/clear` — Reset session state

## Observability

- Activity Bar container with Session, Metrics, Activity, and Entities views
- Dashboard panel via `gramatr: Show Dashboard`
- Live activity trace capturing routing, cache, handoff, and feedback events
- Contextual follow-up suggestions after each `@gramatr` response

## Commands

- `gramatr: Connect Account` — open the dashboard login flow
- `gramatr: Set API Key` — paste a `gramatr_sk_...` key directly into Secret Storage
- `gramatr: Clear Stored API Key` — remove the saved extension credential
- `gramatr: Open Dashboard` — open the dashboard login page
- `gramatr: Show Dashboard` — open the local observability panel

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gramatr.serverUrl` | `https://api.gramatr.com` | gramatr server URL |
| `gramatr.dashboardUrl` | `""` | Optional dashboard URL override for account setup |
| `gramatr.token` | `""` | Legacy auth token fallback (Secret Storage is preferred) |
| `gramatr.timeout` | `15000` | Classification timeout in ms |
| `gramatr.enabled` | `true` | Enable/disable enrichment |
| `gramatr.showClassification` | `true` | Show classification summary in chat |
