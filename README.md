# ElseMail Keeper — Railway cron, proti 5 min-e FS backend check

`elsemail-fs` backend off ache kina dekhe; online thakle kichu kore na,
offline thakle online kore. Check loop: mot 6 bar, normal 5 min por por.
6h zone (run boyos 5.5h+ / kono run nai) + offline hole 2 min por por check.

## Railway deploy

1. Railway -> New Project -> Deploy from GitHub repo -> `elsemail-keeper`
2. Service Settings -> **Cron Schedule**: `*/5 * * * *` (proti 5 min)
3. Variables -> add:
   - `GH_TOKEN` = PAT with Actions read+write on `elsemail-fs`
     (classic scope `repo` + `workflow`, or fine-grained Actions RW)
4. Deploy -> Cron runs -> Logs dekho (`online, valo` / `ONLINE after check`)

Optional vars: `MAX_AGE_MIN=330` `START_GRACE_MIN=12` `CHECKS=6`
`INTERVAL_MIN=5` `TIGHT_INTERVAL_MIN=2` `HEALTH_URL=...`

## Local test

```bash
GH_TOKEN=ghp_... node trigger.js
```

## Khoroch

Online thakle proti run koyek second-e sesh. Offline hole max ~30 min
wait loop chole. Proti 5 min-e cron — usage samanno.
