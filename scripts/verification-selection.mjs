export function selectVerificationLabs(labs, requested) {
  const known = new Set(labs.map((lab) => lab.id));
  for (const id of requested) {
    if (!known.has(id)) throw new Error(`Unknown verification lab: ${id}`);
  }
  const selected = new Set(requested);
  return selected.size ? labs.filter((lab) => selected.has(lab.id)) : labs;
}
