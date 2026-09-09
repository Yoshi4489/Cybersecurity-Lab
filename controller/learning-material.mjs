import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLabs } from "../scripts/standalone-labctl.mjs";

export function readLearningMaterial() {
  return loadLabs().map((lab) => {
    const document = readFileSync(join(lab.directory, "README.md"), "utf8").replace(/\r\n/g, "\n");
    const sections = Object.fromEntries([...document.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map((match) => [match[1], match[2].trim()]));
    const hintGroups = [...sections.Hints.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
    const objectiveGroups = [...sections.Objectives.matchAll(/^### (.+)\n([\s\S]*?)(?=^### |$(?![\s\S]))/gm)];
    const tasks = JSON.parse(readFileSync(join(lab.directory, "tasks.json"), "utf8"));
    if (Object.keys(tasks).length !== lab.objectives.length) throw new Error(`Task coverage mismatch: ${lab.id}`);
    return {
      id: lab.id, title: lab.title, campaign: lab.campaign, mode: lab.mode, minutes: lab.minutes, subnet: lab.subnet,
      prerequisites: lab.prerequisites, learningOutcomes: lab.learningOutcomes,
      scope: `${lab.services.map((service) => typeof service === "string" ? service : service.hostname).filter((name) => name !== "toolbox").join(", ")} (${lab.subnet})`,
      scenario: sections.Scenario, basics: sections["What you need to know"],
      objectivesText: sections.Objectives, solution: sections.Solution, takeaway: sections["What this taught you"],
      objectives: lab.objectives.map(({ id, title, points, dependsOn }) => {
        const task = tasks[id];
        const descriptions = objectiveGroups.filter((group) => group[1].includes(`\`${id}\``));
        const groups = hintGroups.filter((group) => group[1].endsWith(`— ${id}`));
        const checkpoint = task?.checkpoint;
        if (descriptions.length !== 1 || groups.length !== 1 ||
            !task?.evidence?.trim() || !task?.observation?.trim() || !checkpoint?.question?.trim() ||
            !checkpoint?.explanation?.trim() || !Array.isArray(checkpoint.choices) || checkpoint.choices.length !== 3 ||
            checkpoint.choices.some((choice) => typeof choice !== "string" || !choice.trim()) ||
            new Set(checkpoint.choices).size !== 3 || !Number.isInteger(checkpoint.answer) ||
            checkpoint.answer < 0 || checkpoint.answer >= checkpoint.choices.length) {
          throw new Error(`Incomplete task card: ${lab.id}/${id}`);
        }
        return { id, title, points, dependsOn: dependsOn ?? [], ...task,
          // The portal form replaces optional host-only CLI submission commands.
          description: descriptions[0][2].trim().replace(/```sh\nnode scripts\/standalone-labctl\.mjs verify[^`]*```/g, "Use this task's flag field below."),
          hints: [...groups[0][2].matchAll(/<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g)].map((hint) => ({ title: hint[1], body: hint[2].trim() })),
        };
      }),
      hints: hintGroups.map((group) => ({ title: group[1], hints: [...group[2].matchAll(/<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g)].map((hint) => ({ title: hint[1], body: hint[2].trim() })) })),
    };
  });
}
