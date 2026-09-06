/** Logical operations and JSON payload bytes, never a Firebase billing meter. */
export interface PitwallIoEvent {
  operation: 'read' | 'cache' | 'read-shared' | 'disconnect-register' | 'listen' | 'receive' | 'write' | 'delete' | 'transaction' | 'connection'
  path: string
  bytes: number
  success: boolean
  attempts?: number
  committed?: boolean
  connected?: boolean
  deletedPaths?: number
  responseBytes?: number
}

export function jsonPayloadBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value) ?? 'null').byteLength
}

export function createPitwallIoMetrics() {
  const totals = { reads: 0, writes: 0, deletes: 0, subscriptions: 0, deliveries: 0,
    transactions: 0, transactionAttempts: 0, failed: 0, payloadBytesReceived: 0,
    payloadBytesSent: 0, connections: 0, peakConnections: 0, cacheHits: 0, sharedReads: 0, disconnectRegistrations: 0, deletedPaths: 0 }
  const events: PitwallIoEvent[] = []
  function record(event: PitwallIoEvent) {
    events.push({ ...event })
    if (events.length > 500) events.shift()
    if (!event.success) totals.failed++
    if (event.success) totals.deletedPaths += event.deletedPaths ?? 0
    switch (event.operation) {
      case 'read': totals.reads++; if (event.success) totals.payloadBytesReceived += event.bytes; break
      case 'cache': totals.cacheHits++; break
      case 'read-shared': totals.sharedReads++; break
      case 'disconnect-register': totals.disconnectRegistrations++; totals.payloadBytesSent += event.bytes; break
      case 'listen': totals.subscriptions++; break
      case 'receive': totals.deliveries++; totals.payloadBytesReceived += event.bytes; break
      case 'write': totals.writes++; totals.payloadBytesSent += event.bytes; break
      case 'delete': totals.deletes++; totals.payloadBytesSent += event.bytes; break
      case 'transaction':
        totals.transactions++; totals.transactionAttempts += event.attempts ?? 0
        if (event.committed) totals.writes++
        totals.payloadBytesSent += event.bytes
        totals.payloadBytesReceived += event.responseBytes ?? 0
        break
      case 'connection':
        totals.connections = Math.max(0, totals.connections + (event.connected ? 1 : -1))
        totals.peakConnections = Math.max(totals.peakConnections, totals.connections)
        break
    }
  }
  return { record, snapshot: () => ({ ...totals }), events: () => events.map(event => ({ ...event })) }
}
