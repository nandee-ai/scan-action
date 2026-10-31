// Prints the CHANGELOG.md section for one version (release notes).
import { readFileSync } from "node:fs";
const root = new URL("..", import.meta.url).pathname;
const version = process.argv[2];
const text = readFileSync(`${root}CHANGELOG.md`, "utf8");
const start = text.indexOf(`## ${version}`);
if (start < 0) throw new Error(`no section for ${version}`);
const rest = text.slice(start);
const end = rest.indexOf("\n## ", 1);
process.stdout.write(end < 0 ? rest : rest.slice(0, end));
