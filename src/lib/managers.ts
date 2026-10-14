/**
 * The managers assigned to a board column, as a clean list of distinct names.
 * With several managers the server also keeps one comma-joined string in `managerName`
 * ("Varsha, Chinmay"), so the list is read from `managerNames` first and from that string as a fallback.
 */
export function getColumnManagers(column: { managerName?: string | null; managerNames?: string[] | null }): string[] {
  const raw =
    column.managerNames && column.managerNames.length > 0
      ? column.managerNames
      : (column.managerName || '').split(',');

  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of raw) {
    const name = (entry || '').trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/** Text for the manager badge: one manager shows their first name, several show "Multiple". */
export function getManagerBadgeLabel(managers: string[]): string {
  if (managers.length === 0) return '';
  if (managers.length > 1) return 'Multiple';
  return managers[0].split(' ')[0];
}
