import { readFileSync } from "node:fs";
import { z } from "zod";
import { SourceFindingItem, VulnerabilityItem } from "../../src/api/schemas.js";

const dir = new URL("./", import.meta.url);

export function loadSourceFindings(name = "source-findings.android.json") {
  return z.array(SourceFindingItem).parse(JSON.parse(readFileSync(new URL(name, dir), "utf8")));
}

export function loadBinaryFindings(name = "binary-findings.ios.json") {
  return z.array(VulnerabilityItem).parse(JSON.parse(readFileSync(new URL(name, dir), "utf8")));
}
