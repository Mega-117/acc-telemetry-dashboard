/** Serialize side effects; a failed action must not poison the next explicit retry. */
export function createAuthTransitionQueue() {
    let tail: Promise<unknown> = Promise.resolve()
    return {
        run<T>(operation: () => Promise<T>): Promise<T> {
            const next = tail.then(operation, operation)
            tail = next.catch(() => {})
            return next
        },
        whenIdle: () => tail,
    }
}
