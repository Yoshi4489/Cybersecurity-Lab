import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLabs } from "../scripts/standalone-labctl.mjs";

export function readLearningMaterial() {
  return loadLabs().map((lab) => {
    const document = readFileSync(join(lab.directory, "README.md"), "utf8").replace(/\r\n/g, "\n");
    const sections = Object.fromEntries([...document.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map((match) => [match[1], match[2].trim()]));
    const hintGroups = [...sections.Hints.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
    return {
      id: lab.id, title: lab.title, campaign: lab.campaign, mode: lab.mode, minutes: lab.minutes,
      prerequisites: lab.prerequisites, learningOutcomes: lab.learningOutcomes,
      scope: `${lab.services.map((service) => typeof service === "string" ? service : service.hostname).filter((name) => name !== "toolbox").join(", ")} (${lab.subnet})`,
      scenario: sections.Scenario, basics: sections["What you need to know"],
      objectivesText: sections.Objectives, solution: sections.Solution, takeaway: sections["What this taught you"],
      objectives: lab.objectives.map(({ id, title, points, dependsOn }) => ({ id, title, points, dependsOn: dependsOn ?? [] })),
      hints: hintGroups.map((group) => ({ title: group[1], hints: [...group[2].matchAll(/<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g)].map((hint) => ({ title: hint[1], body: hint[2].trim() })) })),
    };
  });
}
