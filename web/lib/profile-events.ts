export const followChangeEvent = "collections-follow-change";
export const archiveChangeEvent = "collections-archive-change";

export type FollowChange = { author: string; following: boolean };
export type ArchiveChange = { author: string; archived: boolean };

export function emitFollowChange(detail: FollowChange) {
  window.dispatchEvent(new CustomEvent(followChangeEvent, { detail }));
}

export function emitArchiveChange(detail: ArchiveChange) {
  window.dispatchEvent(new CustomEvent(archiveChangeEvent, { detail }));
}

export const likeChangeEvent = "collections-like-change";
export type LikeChange = { author: string; asset: string; liked: boolean };

export function emitLikeChange(detail: LikeChange) {
  window.dispatchEvent(new CustomEvent(likeChangeEvent, { detail }));
}
