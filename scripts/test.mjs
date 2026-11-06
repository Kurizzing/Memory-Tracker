// tests/*.test.ts 를 번들한 뒤 node:test 로 실행합니다.
import esbuild from "esbuild";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const files = fs.readdirSync("tests").filter((f) => f.endsWith(".test.ts"));
await esbuild.build({
	entryPoints: files.map((f) => `tests/${f}`),
	bundle: true,
	platform: "node",
	format: "esm",
	outdir: ".test",
	outExtension: { ".js": ".mjs" },
	logLevel: "warning",
});
const out = files.map((f) => `.test/${f.replace(/\.ts$/, ".mjs")}`);
const r = spawnSync(process.execPath, ["--test", ...out], { stdio: "inherit" });
process.exit(r.status ?? 1);
