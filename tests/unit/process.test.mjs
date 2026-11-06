import assert from "node:assert/strict";
import test from "node:test";
import { run } from "../support/process.mjs";

test("captures output from a successful command", async () => {
  const output = await run(
    process.execPath,
    ["-e", "process.stdout.write('ok')"],
    { capture: true },
  );
  assert.equal(output, "ok");
});

test("reports the exit status and captured error output", async () => {
  await assert.rejects(
    run(
      process.execPath,
      ["-e", "process.stderr.write('failure'); process.exit(7)"],
      { capture: true },
    ),
    /exit code 7[\s\S]*failure/,
  );
});

test("terminates an unresponsive command at its deadline", async () => {
  await assert.rejects(
    run(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
      capture: true,
      timeoutMs: 200,
    }),
    /timed out after 200 ms/,
  );
});
