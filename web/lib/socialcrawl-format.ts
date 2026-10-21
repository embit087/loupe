// Shared by the server page and the client catalogue, so it cannot live beside the fs reads.
export function creditLabel(endpoint: { cost: number; min: number; max: number }) {
  return endpoint.min === endpoint.max ? `${endpoint.cost}` : `${endpoint.min}–${endpoint.max}`;
}

export const formatCredits = (value: number) => value.toLocaleString("en-US");
