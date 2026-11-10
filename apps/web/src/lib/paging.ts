// src/lib/paging.ts
// Loads a list that the API serves in pages, until a page comes back shorter
// than the page size. It has no dependency, so it can be tested on its own.

export const PAGE_SIZE = 100;
// A guard against a server that never returns a short page.
const MAX_PAGES = 1000;

export async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  limit: number = PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await fetchPage(limit, page * limit);
    all.push(...rows);
    if (rows.length < limit) return all;
  }
  throw new Error(`The list has more than ${MAX_PAGES} pages`);
}
