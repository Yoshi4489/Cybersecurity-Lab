// A status read is usable only until a newer read or mutation for that lab.
// Mutations invalidate reads at BOTH boundaries, including reads already in flight.
export function createProgressRequests() {
  const versions = new Map<string, number>();
  const mutations = new Set<string>();
  const advance = (id: string) => {
    const version = (versions.get(id) ?? 0) + 1;
    versions.set(id, version);
    return version;
  };
  return {
    read(id: string) { return mutations.has(id) ? null : advance(id); },
    current(id: string, version: number | null) {
      return version !== null && !mutations.has(id) && versions.get(id) === version;
    },
    beginMutation(id: string) {
      if (mutations.has(id)) return false;
      mutations.add(id); advance(id);
      return true;
    },
    endMutation(id: string) { mutations.delete(id); advance(id); },
  };
}
