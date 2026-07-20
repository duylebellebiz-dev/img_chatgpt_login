const flightControllers = new Map<string, AbortController>();

export function registerFlightAbort(id: string, controller: AbortController): void {
  flightControllers.set(id, controller);
}

export function clearFlightAbort(id: string): void {
  flightControllers.delete(id);
}

export function abortFlight(id: string): void {
  flightControllers.get(id)?.abort();
  flightControllers.delete(id);
}
