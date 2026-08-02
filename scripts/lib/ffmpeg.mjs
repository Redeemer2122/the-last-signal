import { spawn, spawnSync } from "node:child_process";

function resolveExecutable(name) {
  const result = spawnSync(name, ["-version"], { encoding: "utf8", shell: false });
  if (!result.error && result.status === 0) return name;
  const guidance = process.platform === "win32"
    ? "Install with `winget install --id Gyan.FFmpeg --exact`, then restart the terminal."
    : "Install FFmpeg with your platform package manager and ensure it is on PATH.";
  throw new Error(`${name} is unavailable. ${guidance}`);
}

export function assertFfmpeg() {
  return {
    ffmpeg: resolveExecutable("ffmpeg"),
    ffprobe: resolveExecutable("ffprobe"),
  };
}

export function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: options.quiet ? "pipe" : "inherit", shell: false });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (data) => { stdout += data; });
    if (child.stderr) child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${executable} exited with ${code}\n${stderr}`));
    });
  });
}

export async function probeJson(ffprobe, file, entries = "format:stream") {
  const { stdout } = await run(ffprobe, [
    "-v", "error",
    "-show_entries", entries,
    "-of", "json",
    file,
  ], { quiet: true });
  return JSON.parse(stdout);
}
