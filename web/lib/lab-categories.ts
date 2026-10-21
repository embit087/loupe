export const labCategories = ["art-technical-leads", "seo-leads", "art-ref-leads"] as const;

export type LabCategory = typeof labCategories[number];

export function isLabCategory(value: unknown): value is LabCategory {
  return typeof value === "string" && labCategories.some((category) => category === value);
}
