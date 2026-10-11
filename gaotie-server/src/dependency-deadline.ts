/** Bounds application wait time even when an established socket or close never settles. */
export async function withDependencyDeadline<T>(operation: () => Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {timer=setTimeout(()=>reject(new Error('Dependency deadline exceeded')),milliseconds);}),
    ]);
  } finally { if(timer) clearTimeout(timer); }
}
export function closeSessionWithoutBlocking(session: {close: () => Promise<unknown>}) {
  // The driver owns cleanup; a stalled close must not extend the response deadline.
  void Promise.resolve().then(()=>session.close()).catch(()=>undefined);
}
