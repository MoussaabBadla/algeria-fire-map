const STORAGE_KEY = "followedWilayas";

export function getFollowed(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

export function toggleFollow(code: number): boolean {
  const current = getFollowed();
  const idx = current.indexOf(code);
  if (idx >= 0) {
    current.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    return false;
  }
  current.push(code);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  return true;
}

export function isFollowed(code: number): boolean {
  return getFollowed().includes(code);
}