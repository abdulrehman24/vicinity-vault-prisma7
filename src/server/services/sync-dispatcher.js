const getSyncJobStore = () => {
  if (!globalThis.__syncJobStore) {
    globalThis.__syncJobStore = new Map();
  }
  return globalThis.__syncJobStore;
};

export const dispatchBackgroundSync = ({ key, task, logger = console }) => {
  const store = getSyncJobStore();
  if (store.has(key)) {
    return { accepted: false, reason: "already_running" };
  }

  const startedAt = new Date().toISOString();
  const promise = (async () => {
    try {
      await task();
    } catch (error) {
      logger.error?.("Background sync job failed", {
        key,
        error: error?.message || "Unknown error"
      });
    } finally {
      store.delete(key);
    }
  })();

  store.set(key, {
    startedAt,
    promise
  });

  return { accepted: true, startedAt };
};

