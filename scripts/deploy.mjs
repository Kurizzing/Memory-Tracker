// 빌드 결과물을 볼트의 플러그인 폴더로 복사합니다.
// 볼트 경로: 환경변수 OBSIDIAN_VAULT 또는 첫 번째 인자, 기본값 "C:/Obsidian Vault"
// community-plugins.json 등 다른 볼트 파일은 건드리지 않습니다.
import fs from "node:fs";
import path from "node:path";

const vault = process.argv[2] || process.env.OBSIDIAN_VAULT || "C:/Obsidian Vault";
const dest = path.join(vault, ".obsidian", "plugins", "memory-tracker");

if (!fs.existsSync(path.join(vault, ".obsidian"))) {
	console.error(`볼트를 찾을 수 없습니다: ${vault}`);
	process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) {
	fs.copyFileSync(f, path.join(dest, f));
	console.log(`copied ${f} -> ${dest}`);
}
