export async function requireDesktopUiCompatibility(expected: number, bridge?: {
  getDesktopUiContract?: () => Promise<number>
}) {
  if (!expected) return
  if (!bridge?.getDesktopUiContract) {
    throw new Error('Interfaccia e programma non compatibili. Riparare l’installazione di Racer Core.')
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const actual = await Promise.race([
      bridge.getDesktopUiContract(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Il programma non risponde. Riavvia Racer Core.')), 5000)
      }),
    ])
    if (actual !== expected) throw new Error('Interfaccia e programma non compatibili. Riparare l’installazione di Racer Core.')
  } finally {
    clearTimeout(timer)
  }
}
