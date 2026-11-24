/**
 * Converting a recorded segment to 16 kHz mono WAV.
 *
 * Two reasons this exists rather than sending what the browser produced.
 *
 * Gemini accepts a fixed set of audio containers and WebM is not among them,
 * while Chrome's MediaRecorder produces WebM and nothing else. Converting in
 * the browser is the only place the fix can live without adding a media
 * pipeline to the server.
 *
 * It is also much smaller. Speech at 16 kHz mono 16-bit is about 32 kB per
 * second — a forty-second segment is 1.3 MB, which stays inside the
 * platform's request limit once base64 has grown it by a third. Sending the
 * original at 48 kHz stereo would not.
 *
 * 16 kHz is not a compromise: speech recognition models are trained at that
 * rate and resample to it anyway.
 */

const TARGET_RATE = 16_000

/**
 * Decodes an audio blob and re-encodes it as WAV.
 *
 * Decoding is the browser's own decoder, so whatever MediaRecorder produced —
 * WebM/Opus on Chrome, Ogg on Firefox, MP4/AAC on Safari — is handled without
 * a format check.
 */
export async function toWav16kMono(blob: Blob): Promise<Blob> {
  const bytes = await blob.arrayBuffer()

  // A short-lived context purely to decode. Closed immediately, because an
  // AudioContext left open holds the audio hardware awake.
  const decodeContext = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodeContext.decodeAudioData(bytes.slice(0))
  } finally {
    void decodeContext.close()
  }

  const frames = Math.max(1, Math.ceil((decoded.duration * TARGET_RATE)))
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()

  const resampled = await offline.startRendering()
  return encodeWav(resampled.getChannelData(0), TARGET_RATE)
}

/** Float samples in −1…1 to a 16-bit PCM WAV file. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM header length
  view.setUint16(20, 1, true) // format: PCM
  view.setUint16(22, 1, true) // channels: mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i += 1) {
    // Clamp before scaling: a sample slightly outside the range would
    // otherwise wrap and become a loud click.
    const clamped = Math.max(-1, Math.min(1, samples[i]!))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Whether a segment carries any speech worth sending.
 *
 * A silent forty seconds is common — someone pauses the discussion, or the
 * microphone is muted — and sending it wastes a request and invites the model
 * to describe the silence. The threshold is deliberately low so that quiet
 * speech is still sent; this only catches near-digital silence.
 */
export async function hasAudibleContent(wav: Blob): Promise<boolean> {
  const bytes = await wav.arrayBuffer()
  const samples = new Int16Array(bytes, 44)
  if (samples.length === 0) return false

  let sum = 0
  // Every 16th sample is plenty to tell silence from speech and keeps this
  // off the critical path of a long segment.
  for (let i = 0; i < samples.length; i += 16) sum += Math.abs(samples[i]!)
  const average = sum / Math.ceil(samples.length / 16)

  return average > 60 // roughly −55 dBFS
}
