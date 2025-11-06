/**
 * 汎用デバウンス関数
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  wait: number
): {
  debounced: (...args: Parameters<T>) => void;
  flush: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      const invokeArgs = lastArgs;
      lastArgs = null;
      if (invokeArgs) {
        func(...invokeArgs);
      }
    }, wait);
  };

  const flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      const invokeArgs = lastArgs;
      lastArgs = null;
      if (invokeArgs) {
        func(...invokeArgs);
      }
    }
  };

  return { debounced, flush };
}
