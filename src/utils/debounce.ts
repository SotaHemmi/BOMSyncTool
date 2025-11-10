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

  const invoke = (args: Parameters<T>) => {
    try {
      const result = func(...args);
      const maybePromise = result as unknown;
      if (
        maybePromise !== null &&
        (typeof maybePromise === 'object' || typeof maybePromise === 'function') &&
        'then' in (maybePromise as PromiseLike<unknown>)
      ) {
        Promise.resolve(maybePromise)
          .catch((error: unknown) => {
            console.error('Debounced function rejected', error);
          });
      }
    } catch (error) {
      console.error('Debounced function threw an error', error);
    }
  };

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
        invoke(invokeArgs);
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
        invoke(invokeArgs);
      }
    }
  };

  return { debounced, flush };
}
