import { loadLabs, composePrefix } from "./standalone-labctl.mjs";
import { docker } from "../controller/instances.mjs";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "reconlab-prepare-"));
try {
  for (const lab of loadLabs()) {
    const flags = join(directory, "build.env");
    writeFileSync(flags, lab.objectives.map((o) => `${o.flagEnv}=BUILD_ONLY`).join("\n"));
    console.log(`Preparing ${lab.id}`);
    await docker([...composePrefix(lab, flags), "build"]);
  }
  console.log("Build layers cached. Instances still receive their own addresses and runtime flags.");
} finally { rmSync(directory, { recursive: true, force: true }); }
