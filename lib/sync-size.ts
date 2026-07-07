import type { GyeolSyncPayload } from "./sync-payload";

export type SyncRequestBodyInput = {
  dryRun: boolean;
  payload: GyeolSyncPayload;
};

export function buildSyncRequestBody(input: SyncRequestBodyInput): string {
  return JSON.stringify(input);
}

export function syncRequestByteSize(body: string): number {
  return new TextEncoder().encode(body).length;
}

