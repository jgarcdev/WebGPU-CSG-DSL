// Debounced file watcher for Deno
// Usage (via deno task or directly):
// deno run --allow-run --allow-read --allow-env watch_debounce.ts -- deno run --unstable-bundle --allow-net --allow-read server.ts

const args = Deno.args.slice();
if (args.length === 0) {
  console.error("Usage: watch_debounce.ts -- <command...>");
  Deno.exit(2);
}

// If user passed a leading `--`, strip it
if (args[0] === "--") args.shift();

if (args.length === 0) {
  console.error("No command provided after "--"");
  Deno.exit(2);
}

const DEBOUNCE_MS = Number(Deno.env.get("DEBOUNCE_MS") ?? "2000");
const WATCH_PATHS = ["./"];

function spawnCmd(cmdArgs: string[]) {
  const [cmd, ...rest] = cmdArgs;
  const command = new Deno.Command(cmd, {
    args: rest,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return command.spawn();
}

let child = spawnCmd(args);
let timer: number | null = null;

async function tryKill(childRef: Deno.ChildProcess) {
  try {
    childRef.kill("SIGTERM");
  } catch {
    try {
      childRef.kill("SIGKILL");
    } catch {
			;
		}
  }
}

async function restart() {
  console.log("[watch] restarting process");
  try {
    await tryKill(child);
  } catch (e) {
    console.error("[watch] kill error:", e);
  }
  // small pause to give resources back
  await new Promise((r) => setTimeout(r, 150));
  child = spawnCmd(args);
}

console.log(`[watch] watching ${WATCH_PATHS.join(", ")} (debounce ${DEBOUNCE_MS}ms) — running: ${args.join(' ')}`);

for await (const event of Deno.watchFs(WATCH_PATHS)) {
  // ignore empty events
  if (!event || !event.kind) continue;
  // debounce rapid sequences
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    restart().catch((e) => console.error(e));
    timer = null;
  }, DEBOUNCE_MS) as unknown as number;
}
