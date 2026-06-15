// PIP-138: i testi TTS del copione sono sempre minuscoli — è un contratto
// verificato in tests/config/voiceScript.test.ts. Qui sta la logica PURA
// (nessun I/O) che blinda quel contratto al salvataggio: trim + minuscolo su
// ogni testo di step e scenario. Il minuscolo non incide sul tono/emozione di
// Kokoro, quindi è una normalizzazione sicura. La route voice-script.post.ts
// la richiama prima di scrivere il file (unico punto: copre UI, API, edit manuali).

export function normalizeVoiceText(text: string): string {
  return text.trim().toLowerCase()
}

export interface VoiceScriptEntry {
  text: string
  [key: string]: unknown
}

export interface VoiceScriptBody {
  steps: VoiceScriptEntry[]
  scenarios: VoiceScriptEntry[]
  [key: string]: unknown
}

/** Normalizza in-place i testi di steps e scenarios (trim + minuscolo) e ritorna il body. */
export function normalizeVoiceScript<T extends VoiceScriptBody>(body: T): T {
  for (const s of body.steps) s.text = normalizeVoiceText(s.text)
  for (const s of body.scenarios) s.text = normalizeVoiceText(s.text)
  return body
}
