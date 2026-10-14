type StoragePort = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
/** Keep the original context across network/model retries, reloads and tabs. */
export function pendingTextRequest<T extends { content: string }>(
  storage: StoragePort,
  accountId: string,
  tokenId: number,
  body: T,
  uuid: () => string,
) {
  const key = `aim:text:${accountId}:${tokenId}`;
  const saved = storage.getItem(key);
  if (saved) {
    const value = JSON.parse(saved) as T & { requestId: string };
    if (!value.requestId || value.content !== body.content)
      throw new Error(
        "Retry the previous message first using its original text. It may already be charged.",
      );
    return { key, body: value };
  }
  const value = { ...body, requestId: uuid() };
  storage.setItem(key, JSON.stringify(value));
  return { key, body: value };
}
