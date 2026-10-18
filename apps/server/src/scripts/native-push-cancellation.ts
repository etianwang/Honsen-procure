import type { EventEmitter } from 'node:events'

export type NativePushCancellationSource = 'aborted' | 'socket-close'

export type NativePushCancellationObservation = {
  cancellationSource: NativePushCancellationSource
  cancellationObservedAt: string
  barrierReleasedAt: string | null
  responseCompleted: boolean
  socketDestroyed: boolean
  accepted: boolean
}

type NativePushRequest = EventEmitter & {
  socket?: EventEmitter & { destroyed?: boolean }
}

type NativePushResponse = {
  writableEnded?: boolean
  finished?: boolean
}

export function observeNativePushCancellation({
  raw,
  response,
  now = () => new Date().toISOString(),
  onObservation,
}: {
  raw: NativePushRequest
  response: NativePushResponse
  now?: () => string
  onObservation: (observation: NativePushCancellationObservation) => void
}) {
  let barrierReleasedAt: string | null = null
  let resolveCancellation: (observation: NativePushCancellationObservation) => void
  const cancellation = new Promise<NativePushCancellationObservation>((resolve) => {
    resolveCancellation = resolve
  })
  const observe = (cancellationSource: NativePushCancellationSource) => {
    const observation = {
      cancellationSource,
      cancellationObservedAt: now(),
      barrierReleasedAt,
      responseCompleted: Boolean(response.writableEnded || response.finished),
      socketDestroyed: Boolean(raw.socket?.destroyed),
      accepted: false,
    }
    observation.accepted = observation.barrierReleasedAt === null && !observation.responseCompleted
    onObservation(observation)
    if (observation.accepted) resolveCancellation(observation)
  }
  raw.once('aborted', () => observe('aborted'))
  raw.socket?.once('close', () => observe('socket-close'))
  return {
    cancellation,
    markBarrierReleased: () => {
      barrierReleasedAt = now()
      return barrierReleasedAt
    },
  }
}
