# BACKGROUND JOB REGISTRY

One append-only file, `registry.jsonl`. One JSON object per line. **Append, never
rewrite** — four lanes write here and a rewrite loses another lane's line.

A later line for the same `job_id` SUPERSEDES an earlier one. Read the file, keep
the last line per `job_id`, and that is the current state.

Fields (all required except `pid`):

```
job_id            stable slug, e.g. "new2-hc-classify-walk"
owner_lane        LCC | RCC | NEW1 | NEW2 | NEW3
purpose           one line
pid               live process id, or null when not running
command           the exact command line
started_at        ISO
checkpoint        canonical checkpoint / worklist path, or the DB predicate that resumes it
log               canonical log path
restart_policy    "resume-from-checkpoint" | "never-auto-restart" | "continuous"
finite            true | false
resource_class    LIGHT | CPU_HEAVY | DB_SCAN | GPU_EMBED | VECTOR_BUILD
progress_invariant  the REAL measure of progress — never "process is alive"
last_verified_progress  { at: ISO, measure: string, value: any }
status            RUNNING | STALLED | FINISHED | STOPPED | UNKNOWN
```

**A process being alive does not prove progress. A process being absent does not
prove completion.** Verify `progress_invariant` before writing `RUNNING`.
