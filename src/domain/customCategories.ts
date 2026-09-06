export function validCustomCategoryName(name: string): boolean {
  return Boolean(name) && !/[<>:"/\\|?*]/.test(name) && name !== "." && name !== "..";
}

export function normalizedCategoryExtensions(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((extension) => extension.replace(/^\./, "").toLowerCase()).filter((extension) => /^[a-z0-9]+$/.test(extension)))];
}