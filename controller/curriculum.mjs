export function unmetLabPrerequisites(lab, labById, progress) {
  return (lab.prerequisites ?? []).filter((id) => {
    const prerequisite = labById.get(id);
    const completed = new Set(progress[id]?.completedObjectives ?? []);
    return !prerequisite || prerequisite.objectives.some((objective) => !completed.has(objective.id));
  });
}

export function unmetObjectivePredecessors(lab, objectiveId, labProgress) {
  const index = lab.objectives.findIndex((objective) => objective.id === objectiveId);
  if (index <= 0) return [];
  const completed = new Set(labProgress?.completedObjectives ?? []);
  return lab.objectives.slice(0, index).map((objective) => objective.id).filter((id) => !completed.has(id));
}
