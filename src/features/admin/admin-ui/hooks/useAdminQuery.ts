'use client';

import { useCallback, useEffect, useState } from 'react';

export const useAdminQuery = <T>(loader: () => Promise<T>) => {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(undefined);

    loader()
      .then((nextData) => {
        if (active) setData(nextData);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        console.error('Failed to load Wedai admin data:', cause);
        setError(cause instanceof Error ? cause : new Error('Unknown admin data error'));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loader, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { data, error, isLoading, reload };
};
