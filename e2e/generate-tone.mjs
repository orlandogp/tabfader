// Generates a tiny, valid WAV file (2s, 440Hz sine, 8kHz mono 16-bit PCM)
// for the E2E media page. Committed alongside its output (e2e/tone.wav)
// because the data-URI video in the original brief is invalid media data
// and never produces real audio (tab never becomes `audible: true`).
//
// Run with: node e2e/generate-tone.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SAMPLE_RATE = 8000; // Hz — kept low to keep the committed asset small.
const DURATION_S = 2;
const FREQ = 440; // A4
const AMPLITUDE = 0.5 * 32767;

const numSamples = SAMPLE_RATE * DURATION_S;
const dataSize = numSamples * 2; // 16-bit mono => 2 bytes/sample

const buffer = Buffer.alloc(44 + dataSize);

// RIFF header
buffer.write('RIFF', 0, 'ascii');
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8, 'ascii');

// fmt chunk
buffer.write('fmt ', 12, 'ascii');
buffer.writeUInt32LE(16, 16); // PCM chunk size
buffer.writeUInt16LE(1, 20); // audio format = PCM
buffer.writeUInt16LE(1, 22); // channels = 1
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate = sampleRate * blockAlign
buffer.writeUInt16LE(2, 32); // block align = channels * bitsPerSample/8
buffer.writeUInt16LE(16, 34); // bits per sample

// data chunk
buffer.write('data', 36, 'ascii');
buffer.writeUInt32LE(dataSize, 40);

for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  const sample = Math.round(AMPLITUDE * Math.sin(2 * Math.PI * FREQ * t));
  buffer.writeInt16LE(sample, 44 + i * 2);
}

const outPath = path.join(__dirname, 'tone.wav');
writeFileSync(outPath, buffer);
console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
