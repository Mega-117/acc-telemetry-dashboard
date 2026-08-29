export function createRetryableSingleFlightLoader<T>(loadValue: () => Promise<T>) {
  let request: Promise<T> | null = null

  function load(): Promise<T> {
    if (!request) {
      request = loadValue().catch((error) => {
        request = null
        throw error
      })
    }
    return request
  }

  return { load }
}
