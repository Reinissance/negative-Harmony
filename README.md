# Negative Harmony MIDI Player
A web MIDI file player with the capability to playback in [negative harmony](https://en.wikipedia.org/wiki/Negative_harmony).

This tool loads and plays MIDI files using [Tone.js](https://tonejs.github.io/), alters the note pitches via [heavy](https://github.com/Wasted-Audio/hvcc) (a JS generator), and renders the audio with [WebAudioFont](https://github.com/surikov/webaudiofont).

## Usage

### Basic

Upload a MIDI file and hit play. [Try it out here.](https://reinissance.github.io/negative-Harmony/index.html)

### External MIDI File

You can load a MIDI file from an external link, provided the CORS headers of the source allow it (most files on [bitmidi](https://bitmidi.com/) do). Paste the link into the input field. For example, you can share links to specific files like: [Ludwig's Knocking Fate](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https://bitmidi.com/uploads/34948.mid).

### External MIDI Devices

If an external MIDI keyboard and/or a multitimbral sound module is connected to your device, they can be used as well.

### Instrument Settings

You can adjust settings for the instruments, such as volume, panning and reverb, or switch to another soundfont.

## Modes

- **Normal**: Simple MIDI playback.
- **Left-hand Piano**: Inverts notes around middle D (MIDI number 62), except for drum channel 10.
- **Negative Harmony**: Inverts notes around the root's thirds, except for drum channel 10. The axis lies between major and minor 3rds, so the latter becomes the former, the root becomes the 5th, and vice versa. The root of the loaded MIDI file is detected automatically.

## Per Octave

Negative harmony inverts the piece, making the bass the highest voice for example. You can invert notes per octave for left-hand and negative harmony modes, keeping everything close to its original place. This may cause melodies to switch octaves unexpectedly. Changing the root of the piece shifts this point and transposes the negatively harmonized tune.

## Sharing

If you pasted an url a share button will be provided. The url shared will include the linked file and any change you made to instruments settings.
Settings shared this way will override any midi control message in the file.

## Credits

- [WebAudioFont](https://github.com/surikov/webaudiofont)
- [Tone.js](https://tonejs.github.io/)
- [heavy](https://github.com/Wasted-Audio/hvcc)

This project includes impulse response files provided by various users on freesound.org:
- "cathedral_Saint_Pierre" by allistersandwich -- [Link](https://freesound.org/s/479080/) -- License: Attribution 4.0
- "IR-02 (gunshot in a chapel MIXED)" by unfa -- [Link](https://freesound.org/s/182806/) -- License: Creative Commons 0
- "Winter Forest 01.wav" by greybrother01 -- [Link](https://freesound.org/s/463610/) -- License: Creative Commons 0
- "Shower Clap - Open.wav" by Ligidium -- [Link](https://freesound.org/s/192228/) -- License: Attribution 3.0

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.