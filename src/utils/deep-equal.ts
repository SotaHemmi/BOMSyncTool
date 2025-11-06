type Primitive = string | number | boolean | null | undefined | symbol | bigint;

function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    typeof value !== 'object'
  );
}

function areDatesEqual(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

function areArraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!deepEqual(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function areSetsEqual(a: Set<unknown>, b: Set<unknown>): boolean {
  if (a.size !== b.size) return false;

  for (const item of a) {
    let hasMatch = false;
    for (const candidate of b) {
      if (deepEqual(item, candidate)) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) {
      return false;
    }
  }

  return true;
}

function areMapsEqual(a: Map<unknown, unknown>, b: Map<unknown, unknown>): boolean {
  if (a.size !== b.size) return false;

  for (const [key, value] of a) {
    if (!b.has(key)) {
      return false;
    }
    if (!deepEqual(value, b.get(key))) {
      return false;
    }
  }

  return true;
}

function areObjectsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }
    if (!deepEqual(a[key], b[key])) {
      return false;
    }
  }

  return true;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function deepEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (isPrimitive(a) || isPrimitive(b)) {
    return Object.is(a, b);
  }

  if (a instanceof Date && b instanceof Date) {
    return areDatesEqual(a, b);
  }

  if (a instanceof Set && b instanceof Set) {
    return areSetsEqual(a, b);
  }

  if (a instanceof Map && b instanceof Map) {
    return areMapsEqual(a, b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return areArraysEqual(a, b);
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }

  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) {
    return false;
  }

  return areObjectsEqual(a as Record<string, unknown>, b as Record<string, unknown>);
}
