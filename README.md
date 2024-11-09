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

You can adjust settings for the instruments, such as volume, panning and reverb, change the instrument or switch to another soundfont.

## Modes

- **Normal**: Simple MIDI playback.
- **Left-hand Piano**: Inverts notes around middle D (MIDI number 62), except for drum channel 10.
- **Negative Harmony**: Inverts notes around the root's thirds, except for drum channel 10. The axis lies between major and minor 3rds, so the latter becomes the former, the root becomes the 5th, and vice versa. The root of the loaded MIDI file is detected automatically.

## Per Octave

Negative harmony inverts the piece, making the bass the highest voice for example. You can invert notes per octave for left-hand and negative harmony modes, keeping everything close to its original place. This may cause melodies to switch octaves unexpectedly. Changing the root of the piece shifts this point and transposes the negatively harmonized tune.

## Sharing

If you pasted an url a share button will be provided. The url shared will include the linked file and any change you made to instruments settings.
Settings shared this way will override any midi control message in the file. Thus you can change for example the [intrumentation of a piece](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F27670.mid&channels=%257B%25220%2522%253A%257B%2522instrumentSelect_0%2522%253A%252218%2522%252C%2522panSlider_0%2522%253A%2522-0.55%2522%252C%2522reverbSlider_0%2522%253A%25220.38%2522%252C%2522volumeSlider_0%2522%253A%252269%2522%257D%252C%25221%2522%253A%257B%2522instrumentSelect_1%2522%253A%252218%2522%252C%2522panSlider_1%2522%253A%2522-0.41%2522%252C%2522reverbSlider_1%2522%253A%25220.33%2522%252C%2522sfIndex_1%2522%253A%25221%2522%252C%2522volumeSlider_1%2522%253A%252256%2522%257D%252C%25222%2522%253A%257B%2522instrumentSelect_2%2522%253A%252218%2522%252C%2522panSlider_2%2522%253A%2522-0.58%2522%252C%2522reverbSlider_2%2522%253A%25220.37%2522%252C%2522sfIndex_2%2522%253A%25223%2522%252C%2522volumeSlider_2%2522%253A%252252%2522%257D%252C%25223%2522%253A%257B%2522instrumentSelect_3%2522%253A%252232%2522%252C%2522panSlider_3%2522%253A%25220.66%2522%252C%2522sfIndex_3%2522%253A%25221%2522%252C%2522volumeSlider_3%2522%253A%2522127%2522%252C%2522reverbSlider_3%2522%253A%25220.34%2522%257D%252C%25224%2522%253A%257B%2522instrumentSelect_4%2522%253A%252264%2522%252C%2522volumeSlider_4%2522%253A%252277%2522%257D%257D&perOktave=1&mode=2&negRoot=58&irUrl=3&reverbGain=0.1)

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