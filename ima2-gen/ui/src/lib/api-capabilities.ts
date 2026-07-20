import { jsonFetch } from "./api-core";

export type Ima2Capabilities = {
  limits?: {
    maxRefCount?: number;
    maxGeneratedImages?: number;
  };
};

export function getCapabilities(): Promise<Ima2Capabilities> {
  return jsonFetch<Ima2Capabilities>("/api/capabilities");
}
