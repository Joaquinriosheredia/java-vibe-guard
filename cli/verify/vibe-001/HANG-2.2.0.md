# `--verify VIBE-001` hang in 2.2.0 (fixed in 2.2.1)

Public summary of the diagnosis made on 2026-10-06 (PR #30). Every figure below comes
from a run recorded in that PR's CI logs or from the local experiment described here.

## Symptom

`npx java-vibe-guard@2.2.0 --verify VIBE-001` could wait forever, with no output and no
error, after "Running VIBE-001 verification…". It happened in this repository's CI after a
GitHub runner image update (`ubuntu-24.04` 20260927.320.1 → 20261004.327.1): 2 of 2 runs on
the new image hung (27 and 16 minutes, cancelled); the same package passed on the old one.
The verifier's own 300 s Maven time limit did not stop it.

## Cause

2.2.0's verifier (`cli/verify/vibe-001/index.js`) started `mvn` and read its stderr but
**never its stdout**.

- Node gives a child's stdout a UNIX socketpair. Once nobody reads it, it accepts a limited
  amount, which depends on the size of each `write()`. Measured here:

  | bytes per write | written before the writer blocks |
  |---:|---:|
  | 1 | 65 709 |
  | 128 | 87 808 |
  | 512 | 118 784 |
  | ≥ 4 096 | ~200 000 |

- **Maven 3.10.0** (the new runner image's Maven) writes its console **one byte per
  `write()`**. Traced with `strace` on the verifier's build: 63 081 writes of 1 byte.
  **Maven 3.9.16** (the old image's) writes line by line: 180 writes, 346 bytes on average.
- A first run, with the Postgres image not cached yet, prints about 67 KB (67 268 bytes with
  Maven 3.10.0, 66 672 with 3.9.16). With 1-byte writes that is more than the unread socket
  takes, so Maven 3.10.0 blocks. 3.9.16 writes larger chunks, which fit.
- Thread dump at the hang (CI watchdog): Maven's `ThreadedStreamConsumer` and
  `fork-1-err-thread`, which forward surefire's forked test JVM output to Maven's console, were
  blocked in a native `FileOutputStream.write`. Maven's `main` was waiting in
  `ForkStarter.fork` → `CountdownCloseable.awaitClosed` for the fork, forever.
- The 300 s limit only killed `mvn` itself, and 2.2.0 then waited for the child's `close`
  event, which a stream still held open never delivered.

**Not the cause:** Docker and its API. Both runner images had Docker 28.0.4, API 1.48, minimum
accepted API 1.24, no `DOCKER_*` or Testcontainers overrides, and Testcontainers 1.20.4
connected on both. The same Maven build with stdout redirected to a file finished in 51 s on
the new image. Testcontainers was not changed.

## Reproduced locally, one variable at a time

Same machine, same Docker (29.1.3); only the listed variable changes.

| Maven | Postgres image | Maven stdout | Result |
|---|---|---|---|
| 3.9.16 | cached | not read (2.2.0) | OK, 47 s |
| 3.10.0 | cached | not read | OK, 47 s |
| **3.10.0** | **not cached** | **not read** | **hung** (stopped at 200 s) |
| 3.9.16 | not cached | not read | OK, 55 s |
| 3.10.0 | not cached | **read** (the only change) | **OK, 56 s** |

## Fix (2.2.1)

- `src/child-process.js` `runBounded()`, used by `--verify` for Maven and
  testcontainers-doctor: **stdout and stderr are always read**, keeping the tail for error
  messages.
- **The time limit kills the whole process tree** and then returns an error ("Maven did not
  finish within 300s …" plus the last output), without waiting for streams a killed process
  may still hold:
  - POSIX: the child leads its own process group, which gets `SIGKILL`. Ctrl+C / SIGTERM to
    `--verify` kill that group too.
  - Windows: `taskkill /PID <pid> /T /F`.
- testcontainers-doctor's stderr, also never read in 2.2.0, is now read.
- Tests:
  - `test/child-process.test.js`: drains 100 000 one-byte writes; the time limit kills a
    child and a grandchild that holds its streams; `--verify` end to end with a fake `mvn`
    (≈70 KB of one-byte writes → completes; never finishes → error, tree killed). With
    2.2.0's verifier that end-to-end test hangs.
  - `test/child-process-stdio.test.js`: every child process the CLI starts must declare
    `stdio`, and an asynchronous `'pipe'` must be read in the same file. It flags both 2.2.0
    calls (Maven and testcontainers-doctor).
- CI: a watchdog in `scripts/smoke-pack.sh` (thread dumps and process tree if `--verify` has
  not finished after 240 s) and `timeout-minutes` on the job.

## Limits

- **Windows:** the tree kill (`taskkill /T /F`) is tested on `windows-latest` with a Node
  process tree. `--verify` itself is not tested on Windows: it starts `mvn`, and Node does
  not resolve `mvn.cmd` without a shell, as in 2.2.0.
- Not measured: Maven versions other than 3.9.16 and 3.10.0. With 2.2.1 their write size no
  longer matters, because the output is read.
