/**
 * T-32: decide what leaves the runner before anything is read.
 *
 *  sast, sca  → nothing is uploaded: Nandee clones the repo itself from the
 *               repo URL and ref (assumption Q1).  Only GitHub hosts today.
 *  dast       → exactly one file, the artifact.
 *
 * The plan is logged and printed in the job summary so customers can see it.
 */
import { InputError } from "../errors.js";
import type { ScanInputs, ScanType } from "../inputs.js";
import { ARTIFACT_EXTENSIONS, artifactPlatform } from "../platform/detect.js";

export interface UploadPlan {
  /** A source scan to start by URL, if any of sast/sca is requested. */
  source: { scanners: string[]; types: ScanType[] } | null;
  /** The one artifact to upload, if dast is requested. */
  artifact: { relativePath: string } | null;
  /** Human-readable list for the summary. */
  describe: string[];
}

/** Assumption Q10: scanner names per scan type. */
export const SCANNERS: Record<Exclude<ScanType, "dast">, string[]> = {
  sast: ["static", "secret"],
  sca: ["dependency"],
};

const SOURCE_HOSTS = ["github.com"];

export function planUpload(inputs: ScanInputs, artifactRelativePath: string | null): UploadPlan {
  const types = inputs.scanTypes;
  const describe: string[] = [];
  let source: UploadPlan["source"] = null;
  let artifact: UploadPlan["artifact"] = null;

  const sourceTypes = types.filter((t): t is Exclude<ScanType, "dast"> => t !== "dast");
  if (sourceTypes.length) {
    const host = new URL(inputs.git.repoUrl).hostname.toLowerCase();
    if (!SOURCE_HOSTS.includes(host)) {
      throw new InputError(
        `sast/sca scans need the repository to be on ${SOURCE_HOSTS.join(" or ")} (Nandee clones it through its GitHub App). ` +
          `This repository is on ${host}. Run a dast scan on the built artifact instead, or ask Nandee about source upload for ${host}.`,
      );
    }
    source = { scanners: [...new Set(sourceTypes.flatMap((t) => SCANNERS[t]))], types: sourceTypes };
    describe.push(`Source scan (${sourceTypes.join(", ")}): Nandee clones ${inputs.git.repoUrl} at ${inputs.git.commitSha.slice(0, 12)} through its GitHub App. Nothing is uploaded from this runner.`);
  }

  if (types.includes("dast")) {
    if (!artifactRelativePath) throw new InputError("dast needs artifact_path");
    if (!artifactPlatform(artifactRelativePath)) {
      throw new InputError(`artifact_path must end in ${ARTIFACT_EXTENSIONS.join(", ")}: ${artifactRelativePath}`);
    }
    artifact = { relativePath: artifactRelativePath };
    describe.push(`Binary scan (dast): uploads one file, ${artifactRelativePath}, to Nandee storage. Nothing else is read.`);
  }

  return { source, artifact, describe };
}
