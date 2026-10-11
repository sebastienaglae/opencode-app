type BackHandler = () => boolean;

const stack: BackHandler[] = [];

/** Registers a handler for the Android back gesture/button. The handler returns
 *  true if it consumed the event. Handlers are a stack: the most recently
 *  registered one is tried first. Returns an unregister function. */
export function pushBackHandler(fn: BackHandler): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Runs the top-most handler; returns true if one consumed the event. */
export function runBackHandler(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    try {
      if (stack[i]()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
