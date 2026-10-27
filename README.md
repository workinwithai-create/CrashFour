# CrashFour

Four-bar landing fill desk for bedroom producers and AI-music finishers.

Stuck loops never hand off. Session players write four live bars of kit fills — snare rolls, crash accents, stutter lands — so the section finally arrives on 1.

Live samples only: FluidR3 kit (kick, snare, hat, crash) + piano/bass bed from the PreEight sample bank pinned to commit `d58301e4a494555f411a2afbc448b724136eee76`.

No oscillators. Audio never leaves the tab.

## Distinct from yesterday and the line

| Tool | Job |
|------|-----|
| MelodyFour | Four bars of live melodic phrase |
| StrideFour | Walking bass |
| VoicingFour | Piano/guitar voicings |
| **CrashFour** | Four bars of live drum fills and crashes so the loop finally lands |

Yesterday's ship was a melodic phrase desk. CrashFour is the missing percussion hand-off.

## Pricing recommendation

One-time **$19** on Lemon Squeezy (merchant of record). Mirror on Gumroad.

Do not subscribe. This is a finite finishing desk. Current build is free (no license gate). A priced build would require a Lemon Squeezy or Gumroad key check.

Best place to sell: Lemon Squeezy checkout linked from the Vercel landing + a pinned X demo. Bedroom producers and Suno finishers already buy one-shot desks this way.

## Export (production-ready)

Default 48 kHz, 24-bit stereo WAV. At 92 BPM / 8 bars the file is exactly 1,001,739 samples. First downbeat at sample 0. Tail folded for seamless loop. Peak ≤ -1 dBFS. Matching MIDI with tempo, time signature, and chair tracks. OfflineAudioContext uses the same schedule path as live playback and the already-loaded raw ArrayBuffers (never re-downloads).

## Samples

Pinned commit SHA only. Never `@main` or `@gh-pages`.

## Acceptance checks (engine rules)

(1) Export length: Math.round(8 * 4 * 60 / 92 * 48000) = 1,001,739 samples. First transient at t=0 by design.
(2) Seamless loop by tail fold; grid-locked.
(3) visibilitychange stops cleanly.
(4) Live state read every step; changes heard next step/bar.
(5) Missing samples named in UI.
(6) Notes sustain via duration + release ramp (crash holds).
(7) No @main/@gh-pages, no Math.random in export path, voice names match samples (kick, snare, hat, crash).

Shippable MVP.

## License

MIT. workinwithai-create.