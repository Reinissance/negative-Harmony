# Negative Harmony MIDI Player
A web MIDI file player with the capability to playback in [negative harmony](https://www.opussciencecollective.com/post/the-harmonic-upside-down-negative-harmony) or backwards.

This tool loads and plays MIDI files using [Tone.js](https://tonejs.github.io/), alters the note pitches via [heavy](https://github.com/Wasted-Audio/hvcc) (its JS generator), and renders the audio with [WebAudioFont](https://github.com/surikov/webaudiofont), while the user can select alternative sounds per channel or drumnote.

## Usage

### Basic

Upload a MIDI file and hit play.

### External MIDI File

You can also load a MIDI file from an external link, provided the CORS headers of the source allow it (most files on [bitmidi](https://bitmidi.com/), [mfiles](https://www.mfiles.co.uk/midi-files.htm) or [midikaos](https://midikaos.mnstrl.org/) do) - just copy the download url of a file and paste into into the input field.

### External MIDI Devices

By default the app uses soundfonts from [WebAudioFont](https://github.com/surikov/webaudiofont), but if an external MIDI keyboard and/or a multitimbral sound module is connected to your device, they can be used as well.
With a midikeyboard attached you can also play in negative mode in realtime.

### Reverse

The playback can be switched to reversed, which simply results in playing backwards. Notes longer than a quarter are then started at the note's end (aka note-off time). [eirenidaB :hcaB.S.J](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F27670.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%2522-0.95%2522%252C%2522volumeSlider_0%2522%253A%252274%2522%257D%252C%25221%2522%253A%257B%2522panSlider_1%2522%253A%25220.88%2522%252C%2522volumeSlider_1%2522%253A%252274%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-0.49%2522%252C%2522volumeSlider_2%2522%253A%2522109%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%25220.24%2522%252C%2522volumeSlider_3%2522%253A%2522114%2522%257D%252C%25224%2522%253A%257B%2522sfIndex_4%2522%253A%25224%2522%252C%2522reverbSlider_4%2522%253A%25220.9%2522%257D%257D&perOktave=1&mode=0&negRoot=59&irUrl=0&speed=0.88&reversedPlayback=true&reverbGain=0.7)

## Modes

- **Normal**: Simple MIDI playback.
- **Left-hand Piano**: Inverts notes around middle D (MIDI number 62), except for drum channel 10.
- **Negative Harmony**: Inverts notes around the root's thirds, except for drum channel 10. The axis lies between major and minor 3rds, so the latter becomes the former, the root becomes the 5th, and vice versa. The root of the loaded MIDI file is detected automatically, but can be changed manually.

For the last two modes pitch bend messages are turned upside down as well.

## Per Octave

Negative harmony inverts the piece, making the bass the highest voice for example. Therefor you can invert notes per octave for left-hand and negative harmony modes, keeping everything close to its original place. This may cause melodies to switch octaves unexpectedly. Changing the root of the piece shifts this point in the negatively harmonized tuned voices (apart from also transposing it).

## Instrument Settings

You can adjust settings such as the global speed, or for each instrument (aka each channel individually) the volume, panning and reverb, or [change the instruments (override programChange Messages)](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F3654.mid&channels=%257B%25220%2522%253A%257B%2522volumeSlider_0%2522%253A%2522127%2522%257D%252C%25221%2522%253A%257B%2522volumeSlider_1%2522%253A%2522109%2522%252C%2522sfIndex_1%2522%253A%25220%2522%252C%2522instrumentSelect_1%2522%253A%252232%2522%252C%2522volumeSlider_drum%2522%253A%2522123%2522%252C%2522panSlider_1%2522%253A%2522-0.42%2522%252C%2522reverbSlider_1%2522%253A%25220.31%2522%257D%252C%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%252299%2522%252C%2522instrumentSelect_2%2522%253A%2522110%2522%252C%2522volumeSlider_drum%2522%253A%252244%2522%252C%2522reverbSlider_2%2522%253A%25221%2522%252C%2522panSlider_2%2522%253A%2522-0.31%2522%252C%2522sfIndex_2%2522%253A%25221%2522%257D%252C%25223%2522%253A%257B%2522volumeSlider_3%2522%253A%252269%2522%252C%2522instrumentSelect_3%2522%253A%252257%2522%252C%2522panSlider_3%2522%253A%25220.14%2522%252C%2522sfIndex_3%2522%253A%25221%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_4%2522%253A%252240%2522%252C%2522panSlider_4%2522%253A%2522-0.59%2522%252C%2522instrumentSelect_4%2522%253A%2522122%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%252253%2522%252C%2522panSlider_5%2522%253A%25220.76%2522%252C%2522instrumentSelect_5%2522%253A%2522127%2522%252C%2522sfIndex_5%2522%253A%25225%2522%252C%2522reverbSlider_5%2522%253A%25220.8%2522%257D%252C%25226%2522%253A%257B%2522volumeSlider_6%2522%253A%252233%2522%252C%2522panSlider_6%2522%253A%2522-0.63%2522%252C%2522instrumentSelect_6%2522%253A%2522107%2522%252C%2522reverbSlider_6%2522%253A%25220.5%2522%252C%2522sfIndex_6%2522%253A%25221%2522%257D%252C%25227%2522%253A%257B%2522volumeSlider_7%2522%253A%252240%2522%252C%2522instrumentSelect_7%2522%253A%2522104%2522%252C%2522panSlider_7%2522%253A%2522-0.01%2522%252C%2522sfIndex_7%2522%253A%25221%2522%252C%2522reverbSlider_7%2522%253A%25220.47%2522%252C%2522volumeSlider_drum%2522%253A%2522120%2522%257D%252C%25228%2522%253A%257B%2522volumeSlider_8%2522%253A%2522111%2522%252C%2522instrumentSelect_8%2522%253A%2522115%2522%252C%2522panSlider_8%2522%253A%25220.84%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectClosed%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectLow%2520Tom%25201%2522%253A2%252C%2522drumNoteSelectLow%2520Tom%25202%2522%253A2%252C%2522drumNoteSelectPedal%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectBass%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectCrash%2520Cymbal%25201%2522%253A2%252C%2522drumNoteSelectCrash%2520Cymbal%25202%2522%253A2%252C%2522volumeSlider_drum%2522%253A%2522107%2522%252C%2522drumNoteSelectBass_Drum_1%2522%253A2%252C%2522drumNoteSelectClosed_Hi-hat%2522%253A2%252C%2522drumNoteSelectSnare_Drum_1%2522%253A2%252C%2522drumNoteSelectCrash_Cymbal_1%2522%253A2%252C%2522drumNoteSelectCrash_Cymbal_2%2522%253A2%252C%2522drumNoteSelectPedal_Hi-hat%2522%253A2%257D%252C%252210%2522%253A%257B%2522volumeSlider_10%2522%253A%252238%2522%252C%2522panSlider_10%2522%253A%25220.67%2522%252C%2522instrumentSelect_10%2522%253A%2522108%2522%252C%2522sfIndex_10%2522%253A%25221%2522%252C%2522volumeSlider_drum%2522%253A%2522122%2522%252C%2522reverbSlider_10%2522%253A%25220.82%2522%257D%252C%252215%2522%253A%257B%2522volumeSlider_15%2522%253A%2522127%2522%252C%2522volumeSlider_drum%2522%253A%2522107%2522%252C%2522panSlider_15%2522%253A%2522-0.61%2522%257D%257D&perOktave=1&mode=0&negRoot=61&reverbGain=1.5&irUrl=2), or switch to another soundfont, or even override single drumSounds to another (notes on drumchannel 10), like exchange the snare with a closed hihat for example.

## Sharing

If you pasted an url a share button will be provided: The url shared will include the linked file. Thus you can for example share links to specific files like: [Ludwig's Knocking Fate](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https://bitmidi.com/uploads/34948.mid).
The url shared will also include any change you made to instruments settings (and therefor may become very long).
Settings shared this way will override any midi control message in the file. This ways you can change for example also the [intrumentation of a piece](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F27670.mid&channels=%257B%25220%2522%253A%257B%2522instrumentSelect_0%2522%253A%252218%2522%252C%2522panSlider_0%2522%253A%2522-0.65%2522%257D%252C%25221%2522%253A%257B%2522instrumentSelect_1%2522%253A%252218%2522%252C%2522panSlider_1%2522%253A%2522-0.56%2522%257D%252C%25222%2522%253A%257B%2522instrumentSelect_2%2522%253A%252218%2522%252C%2522panSlider_2%2522%253A%2522-0.56%2522%252C%2522reverbSlider_2%2522%253A%25220.84%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%25220.53%2522%252C%2522instrumentSelect_3%2522%253A%252232%2522%257D%252C%25224%2522%253A%257B%2522sfIndex_4%2522%253A%25221%2522%252C%2522instrumentSelect_4%2522%253A%252264%2522%257D%257D&perOktave=1&mode=2&negRoot=59&reverbGain=1.01&irUrl=2&speed=0.91). When settings for a channel differ from those of the loaded midi file, a "reset to File Settings"- button will be provided.

## Examples

Here are some examples of MIDI files processed with the Negative Harmony MIDI Player:

<!-- EXAMPLES_START -->
<!-- EXAMPLES_END -->

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