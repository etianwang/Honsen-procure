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
  let acceptedCancellation: NativePushCancellationObservation | undefined
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
    if (observation.accepted) {
      acceptedCancellation = observation
      resolveCancellation(observation)
    }
  }
  const onAborted = () => observe('aborted')
  const onSocketClose = () => observe('socket-close')
  raw.once('aborted', onAborted)
  raw.socket?.once('close', onSocketClose)
  return {
    acceptedCancellation: () => acceptedCancellation,
    cancellation,
    dispose: () => {
      raw.off('aborted', onAborted)
      raw.socket?.off('close', onSocketClose)
    },
    markBarrierReleased: () => {
      barrierReleasedAt = now()
      return barrierReleasedAt
    },
  }
}
