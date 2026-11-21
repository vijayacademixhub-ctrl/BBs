/**
 * Microphone capture that keeps no audio.
 *
 * The recorder is restarted every segment rather than being left running with
 * a timeslice. That is deliberate and costs a fraction of a second at each
 * boundary. A WebM stream is only decodable from its header, so the chunks a
 * timeslice produces are not independently transcribable — only the first
 * one is. Stopping and starting produces a complete, self-contained file each
 * time, which can be sent, transcribed and dropped on its own.
 *
 * The consequence is the property that matters: at no point does a recording
 * of the whole meeting exist. The only audio in memory is the segment being
 * recorded now, and each segment is released as soon as its transcript comes
 * back. Nothing is written to disk and nothing is uploaded to storage.
 */

export const SEGMENT_SECONDS = 40

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopping' | 'stopped'

export interface Segment {
  index: number
  blob: Blob
  seconds: number
}

export interface RecorderHandlers {
  onSegment: (segment: Segment) => void | Promise<void>
  onError: (error: Error) => void
  onStateChange?: (state: RecorderState) => void
}

/** Containers in order of preference; the first the browser supports wins. */
const CANDIDATE_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

export function supportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

export function isCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined' &&
    supportedMimeType() !== null
  )
}

export class SegmentedRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private timer: number | null = null
  private chunks: Blob[] = []
  private segmentIndex = 0
  private segmentStartedAt = 0
  private state: RecorderState = 'idle'
  private stopping = false

  constructor(private readonly handlers: RecorderHandlers) {}

  get currentState(): RecorderState {
    return this.state
  }

  get segmentsProduced(): number {
    return this.segmentIndex
  }

  /**
   * Asks for the microphone and begins.
   *
   * The permission request happens here and nowhere earlier, so it follows
   * the consent step rather than preceding it. If the user refuses, that is
   * reported as a refusal; the recorder never reports itself as running when
   * it is not.
   */
  async start(): Promise<void> {
    if (!isCaptureSupported()) {
      throw new Error(
        'This browser cannot record audio. Chrome, Edge and Firefox can; Safari on iOS stops ' +
          'recording when the screen locks.',
      )
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    })

    this.setState('recording')
    this.beginSegment()
  }

  pause(): void {
    if (this.state !== 'recording') return
    this.clearTimer()
    this.setState('paused')
    // Close the segment in progress rather than suspending it, so the pause
    // boundary is also a segment boundary and nothing is held while paused.
    this.recorder?.stop()
  }

  resume(): void {
    if (this.state !== 'paused' || !this.stream) return
    this.setState('recording')
    this.beginSegment()
  }

  /** Stops, flushes the final segment, and releases the microphone. */
  async stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopped') return
    this.clearTimer()
    this.stopping = true
    this.setState('stopping')

    await new Promise<void>((resolve) => {
      const recorder = this.recorder
      if (!recorder || recorder.state === 'inactive') {
        resolve()
        return
      }
      recorder.addEventListener('stop', () => resolve(), { once: true })
      recorder.stop()
    })

    this.release()
    this.setState('stopped')
  }

  /** Releases the microphone without flushing. Used when a page unmounts. */
  abandon(): void {
    this.clearTimer()
    this.stopping = true
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      // Already stopped; releasing the tracks below is what matters.
    }
    this.chunks = []
    this.release()
    this.setState('stopped')
  }

  private beginSegment(): void {
    if (!this.stream) return
    const mimeType = supportedMimeType() ?? undefined

    const recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined)
    this.recorder = recorder
    this.chunks = []
    this.segmentStartedAt = Date.now()

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    })

    recorder.addEventListener('error', () => {
      this.handlers.onError(new Error('The browser stopped the recording unexpectedly.'))
    })

    recorder.addEventListener('stop', () => {
      const seconds = (Date.now() - this.segmentStartedAt) / 1000
      const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })
      // Drop the references immediately. The blob passed on is the only one
      // that exists, and the consumer releases it once transcribed.
      this.chunks = []

      if (blob.size > 0) {
        this.segmentIndex += 1
        void this.handlers.onSegment({ index: this.segmentIndex, blob, seconds })
      }

      // Roll straight into the next segment unless we are pausing or
      // finishing, which is what makes this continuous from the speaker's
      // point of view.
      if (this.state === 'recording' && !this.stopping) {
        this.beginSegment()
      }
    })

    recorder.start()
    this.timer = window.setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, SEGMENT_SECONDS * 1000)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
  }

  private release(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.stream = null
    this.recorder = null
  }

  private setState(state: RecorderState): void {
    this.state = state
    this.handlers.onStateChange?.(state)
  }
}

export function formatElapsed(seconds: number): string {
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
