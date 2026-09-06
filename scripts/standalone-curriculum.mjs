export function validateCurriculum(labs) {
  const byId = new Map(labs.map((lab) => [lab.id, lab]));
  if (byId.size !== labs.length) throw new Error("Duplicate lab id");
  function checkGraph(items, dependencies, label) {
    const index = new Map(items.map((item) => [item.id, item]));
    if (index.size !== items.length) throw new Error(`Duplicate ${label} id`);
    const active = new Set();
    const done = new Set();
    function visit(id) {
      if (!index.has(id)) throw new Error(`Unknown ${label}: ${id}`);
      if (active.has(id)) throw new Error(`Cycle in ${label}: ${id}`);
      if (done.has(id)) return;
      active.add(id);
      const refs = dependencies(index.get(id));
      if (!Array.isArray(refs)) throw new Error(`Missing dependencies for ${label}: ${id}`);
      for (const ref of refs) visit(ref);
      active.delete(id);
      done.add(id);
    }
    for (const id of index.keys()) visit(id);
  }
  for (const lab of labs) {
    if (!["guided", "challenge", "capstone"].includes(lab.mode)) throw new Error(`Invalid mode: ${lab.id}`);
    if (typeof lab.campaign !== "string" || !lab.campaign.trim()) throw new Error(`Missing campaign: ${lab.id}`);
    if (!Array.isArray(lab.learningOutcomes) || !lab.learningOutcomes.length ||
        lab.learningOutcomes.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error(`Missing learning outcomes: ${lab.id}`);
    }
    checkGraph(lab.objectives, (objective) => objective.dependsOn, `objective in ${lab.id}`);
  }
  checkGraph(labs, (lab) => lab.prerequisites, "prerequisite");
}
