/**
 * SamplePlayer - plays an instrument's samples (piano, guitar…) with Tone.js, built
 * for low latency.
 *
 * Works like Tone.Sampler (triggerAttack / triggerRelease / releaseAll, pitch-shifting
 * the nearest sample), with two differences that matter for responsiveness:
 *  - every note has its own gain, so a note scheduled a few milliseconds ahead can be
 *    cancelled before it sounds (Tone.Sampler's start envelope would bring it back);
 *  - cut() silences everything within 30 ms, release tails included, for a touch that
 *    turns out to be a scroll.
 *
 * Exposed as `window.SamplePlayer`.
 */
(function (root) {
    'use strict';

    class SamplePlayer {
        /**
         * @param {Object} [options]
         * @param {number} [options.release=1] - Seconds a released note takes to fade out
         * @param {number} [options.volume=1] - Output gain (below 1 leaves headroom for chords)
         */
        constructor({ release = 1, volume = 1 } = {}) {
            this.release = release;
            this.samples = [];          // [{ midi, buffer }], sorted by pitch
            this.voices = new Set();    // sounding or scheduled notes: { midi, source, gain, start }
            this.releasing = new Set(); // released notes still fading out
            this.output = new Tone.Gain(volume).toDestination();
        }

        /** Add a sample, e.g. ("C4", buffer). Leading silence is trimmed off first. */
        add(note, buffer) {
            const midi = Tone.Frequency(note).toMidi();
            this.samples.push({ midi, buffer: SamplePlayer.trimLeadingSilence(buffer) });
            this.samples.sort((a, b) => a.midi - b.midi);
        }

        nearestSample(midi) {
            if (this.samples.length === 0) throw new Error('SamplePlayer: no samples added yet');
            return this.samples.reduce((best, sample) =>
                (Math.abs(sample.midi - midi) < Math.abs(best.midi - midi) ? sample : best));
        }

        /**
         * Start notes ("C4", "A#3"…, or an array of them) at `time` (default: now). With a
         * `duration`, they're also released that many seconds later (a release that a
         * later releaseAll() can still bring forward or cancel).
         */
        triggerAttack(notes, time = Tone.immediate(), velocity = 1, duration = undefined) {
            for (const note of [].concat(notes)) {
                const midi = Tone.Frequency(note).toMidi();
                const sample = this.nearestSample(midi);
                const gain = new Tone.Gain(velocity).connect(this.output);
                const source = new Tone.ToneBufferSource({
                    url: sample.buffer,
                    playbackRate: Math.pow(2, (midi - sample.midi) / 12)
                }).connect(gain);
                const voice = { midi, source, gain, start: time };
                source.onended = () => {
                    this.voices.delete(voice);
                    this.releasing.delete(voice);
                    source.dispose();
                    gain.dispose();
                };
                source.start(time);
                if (duration !== undefined) this.fadeOut(voice, time + duration, this.release);
                this.voices.add(voice);
            }
            return this;
        }

        /**
         * Release the given notes at `time`, fading out over `fade` seconds (default: the
         * release time). Notes of the same pitch scheduled to start later (the next chords
         * of a progression) are left alone.
         */
        triggerRelease(notes, time = Tone.immediate(), fade = this.release) {
            const midis = [].concat(notes).map(note => Tone.Frequency(note).toMidi());
            for (const voice of [...this.voices]) {
                if (midis.includes(voice.midi) && voice.start <= time) this.stopVoice(voice, time, fade);
            }
            return this;
        }

        /** Release every note at `time`, fading out over `fade` seconds. */
        releaseAll(time = Tone.immediate(), fade = this.release) {
            for (const voice of [...this.voices]) this.stopVoice(voice, time, fade);
            return this;
        }

        /** Silence everything within 30 ms: notes scheduled to start later, sounding ones and release tails. */
        cut(time = Tone.immediate()) {
            for (const voice of [...this.releasing]) {
                voice.gain.gain.cancelAndHoldAtTime(time);
                this.fadeOut(voice, time, 0.03);
            }
            return this.releaseAll(time, 0.03);
        }

        stopVoice(voice, time, fade) {
            this.voices.delete(voice);
            if (time <= voice.start) {
                // Not started yet: stopping first cancels the source's start envelope,
                // so it never sounds
                voice.source.stop(time);
                return;
            }
            voice.gain.gain.cancelAndHoldAtTime(time);
            this.fadeOut(voice, time, fade);
            this.releasing.add(voice);
        }

        fadeOut(voice, time, fade) {
            const length = Math.max(fade, 0.005);   // a zero time constant would throw
            voice.gain.gain.setTargetAtTime(0, time, length / 6);   // ~-50 dB after `length` seconds
            voice.source.stop(time + length);
        }

        /**
         * Fetch and decode a sample. Tone's own loader would percent-encode the path, which
         * turns the "@" of a versioned npm URL (package@1.2.3/…) into "%40"; the URL is
         * fetched exactly as given instead.
         */
        static async loadBuffer(url, { signal } = {}) {
            const response = await fetch(url, { signal });
            if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
            const audioBuffer = await Tone.getContext().decodeAudioData(await response.arrayBuffer());
            return new Tone.ToneAudioBuffer(audioBuffer);
        }

        /**
         * Cut the quiet lead-in before a sample's attack (silence in the recording, or the
         * padding an MP3 encoder adds), so notes sound as soon as they're played. The cut
         * starts 2 ms before the first sample that reaches 1% (-40 dB) of the peak.
         */
        static trimLeadingSilence(buffer) {
            const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
            // A plucked or struck note peaks near its start: the first second is enough to look at
            const scan = Math.min(buffer.length, Math.round(buffer.sampleRate));
            let peak = 0;
            channels.forEach(data => { for (let i = 0; i < scan; i++) peak = Math.max(peak, Math.abs(data[i])); });
            if (peak === 0) return buffer;
            const threshold = peak * 0.01;
            const onset = Math.min(...channels.map(data => {
                let i = 0;
                while (i < data.length && Math.abs(data[i]) < threshold) i++;
                return i;
            }));
            const start = onset / buffer.sampleRate - 0.002;
            return start > 0.001 ? buffer.slice(start) : buffer;
        }
    }

    root.SamplePlayer = SamplePlayer;
})(window);
