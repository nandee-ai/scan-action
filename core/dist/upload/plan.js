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
import { ARTIFACT_EXTENSIONS, artifactPlatform } from "../platform/detect.js";
/** Assumption Q10: scanner names per scan type. */
export const SCANNERS = {
    sast: ["static", "secret"],
    sca: ["dependency"],
};
const SOURCE_HOSTS = ["github.com"];
export function planUpload(inputs, artifactRelativePath) {
    const types = inputs.scanTypes;
    const describe = [];
    let source = null;
    let artifact = null;
    const sourceTypes = types.filter((t) => t !== "dast");
    if (sourceTypes.length) {
        const host = new URL(inputs.git.repoUrl).hostname.toLowerCase();
        if (!SOURCE_HOSTS.includes(host)) {
            throw new InputError(`sast/sca scans need the repository to be on ${SOURCE_HOSTS.join(" or ")} (Nandee clones it through its GitHub App). ` +
                `This repository is on ${host}. Run a dast scan on the built artifact instead, or ask Nandee about source upload for ${host}.`);
        }
        source = { scanners: [...new Set(sourceTypes.flatMap((t) => SCANNERS[t]))], types: sourceTypes };
        describe.push(`Source scan (${sourceTypes.join(", ")}): Nandee clones ${inputs.git.repoUrl} at ${inputs.git.commitSha.slice(0, 12)} through its GitHub App. Nothing is uploaded from this runner.`);
    }
    if (types.includes("dast")) {
        if (!artifactRelativePath)
            throw new InputError("dast needs artifact_path");
        if (!artifactPlatform(artifactRelativePath)) {
            throw new InputError(`artifact_path must end in ${ARTIFACT_EXTENSIONS.join(", ")}: ${artifactRelativePath}`);
        }
        artifact = { relativePath: artifactRelativePath };
        describe.push(`Binary scan (dast): uploads one file, ${artifactRelativePath}, to Nandee storage. Nothing else is read.`);
    }
    return { source, artifact, describe };
}
//# sourceMappingURL=plan.js.map