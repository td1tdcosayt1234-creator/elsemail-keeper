# ElseMail Keeper — Railway cron, proti 6h-e FS backend run trigger

`elsemail-fs` backend proti run max ~6h bache. Ei cron proti 6h-e GitHub
dispatch dey (notun run), ager-ta expire hoy. Idempotent: fresh run active
thakle skip, stuck run replace kore.

## Railway deploy (5 min)

1. Railway -> New Project -> Deploy from GitHub repo -> `elsemail-keeper`
2. Service Settings -> **Cron Schedule**: `5 */6 * * *` (proti 6h)
3. Variables -> add:
   - `GH_TOKEN` = PAT with Actions read+write on `elsemail-fs`
     (classic scope `repo` + `workflow`, or fine-grained Actions RW)
4. Deploy -> Cron runs -> Logs-e `health OK` dekho

## Local test

```bash
GH_TOKEN=ghp_... node trigger.js
```

## Khoroch

Cron proti run ~5 min chole (health wait) — Railway usage samanno.
