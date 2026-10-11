# ElseMail Keeper — console + auto-heal for FS backend

Persistent Railway web service. Proti 5 min-e (6h zone / offline-e 2 min
por por) `fs.elsemail.indevs.in` check kore: online thakle skip, offline
thakle stuck run cancel + notun run dispatch. Run boyos 5.5h+ hole
proactive replacement — zero downtime.

## Dashboard (for checking)

* `/` — console page: status dot, active run, recent runs table, history
  (60s auto-refresh)
* `/api/status` — same data as JSON
* `/healthz` — Railway healthcheck (`ok`)

## Railway deploy

1. Railway -> New Project -> Deploy from GitHub repo -> `elsemail-keeper`
2. Variables:
   - `GH_TOKEN` (required) — PAT with Actions read+write on `elsemail-fs`
     (classic `repo` + `workflow`, or fine-grained Actions RW)
   - `STATUS_KEY` (optional) — set korle dashboard-e `?key=...` lagbe
   - `ALERT_URL` (optional) — Discord webhook / alert receiver URL.
     Offline/online/dispatch/fail-e JSON `{content, text}` POST jay
3. Deploy -> generated domain-e console kholo. No cron setup needed.

`PORT` Railway nije dey.

## Env reference

| Name | Default | Ki |
|---|---|---|
| `GH_TOKEN` | — | required |
| `STATUS_KEY` | empty (open) | dashboard lock |
| `ALERT_URL` | empty (off) | webhook alerts |
| `OWNER` / `REPO` | td1tdcosayt1234-creator / elsemail-fs | target repo |
| `MAX_AGE_MIN` | 330 | expiring run threshold |
| `START_GRACE_MIN` | 12 | starting run wait |
| `CHECKS` | 6 | mot koybar check |
| `INTERVAL_MIN` | 5 | normal gap |
| `TIGHT_INTERVAL_MIN` | 2 | 6h-zone/offline gap |
| `HEALTH_URL` | fs.../health | checked URL |

## Local

```bash
GH_TOKEN=ghp_... PORT=8090 node server.js
npm test            # unit tests (no network)
GH_TOKEN=ghp_... node trigger.js   # one-shot cron alternative
```

## Files

* `server.js` — web service + loop + dashboard
* `trigger.js` — one-shot version (same rules)
* `lib.js` — shared: API, `decide()` rules, alerts
* `test/keeper.test.js` — rule tests

## Troubleshooting

* Console 401 — `STATUS_KEY` set ache, `?key=` dao
* `dispatch failed 403/404` — token-e Actions permission nai
* Railway restart loop — `GH_TOKEN` missing (logs-e dekho)
