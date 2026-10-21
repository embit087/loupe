export const viewerCookieName = "collections_viewer";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validViewerId(value: string | undefined): string | null {
  return value && uuid.test(value) ? value : null;
}
