# Negative Harmony MIDI Player
A web MIDI file player with the capability to playback in [negative harmony](https://en.wikipedia.org/wiki/Negative_harmony).

This tool loads and plays MIDI files using [Tone.js](https://tonejs.github.io/), alters the note pitches via [heavy](https://github.com/Wasted-Audio/hvcc) (a JS generator), and renders the audio with [WebAudioFont](https://github.com/surikov/webaudiofont).

## Usage

### Basic

Upload a MIDI file and hit play. [Try it out here.](https://reinissance.github.io/negative-Harmony/index.html)

### External MIDI File

You can also load a MIDI file from an external link, provided the CORS headers of the source allow it (most files on [bitmidi](https://bitmidi.com/) do) - just paste the link into the input field. For example, you can share links to specific files like: [Ludwig's Knocking Fate](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https://bitmidi.com/uploads/34948.mid).

### External MIDI Devices

If an external MIDI keyboard and/or a multitimbral sound module is connected to your device, they can be used as well.

### Instrument Settings

You can adjust settings for the instruments individually, such as volume, panning and reverb, [change the instruments (override programChange Messages)](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F3654.mid&channels=%257B%25220%2522%253A%257B%2522volumeSlider_0%2522%253A%2522127%2522%257D%252C%25221%2522%253A%257B%2522volumeSlider_1%2522%253A%2522109%2522%252C%2522sfIndex_1%2522%253A%25220%2522%252C%2522instrumentSelect_1%2522%253A%252232%2522%252C%2522volumeSlider_drum%2522%253A%2522123%2522%252C%2522panSlider_1%2522%253A%2522-0.42%2522%252C%2522reverbSlider_1%2522%253A%25220.31%2522%257D%252C%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%252299%2522%252C%2522instrumentSelect_2%2522%253A%2522110%2522%252C%2522volumeSlider_drum%2522%253A%252244%2522%252C%2522reverbSlider_2%2522%253A%25221%2522%252C%2522panSlider_2%2522%253A%2522-0.31%2522%252C%2522sfIndex_2%2522%253A%25221%2522%257D%252C%25223%2522%253A%257B%2522volumeSlider_3%2522%253A%2522112%2522%252C%2522instrumentSelect_3%2522%253A%252257%2522%252C%2522panSlider_3%2522%253A%25220.14%2522%252C%2522sfIndex_3%2522%253A%25221%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_4%2522%253A%252265%2522%252C%2522panSlider_4%2522%253A%2522-0.59%2522%252C%2522instrumentSelect_4%2522%253A%2522127%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%2522105%2522%252C%2522panSlider_5%2522%253A%25220.76%2522%252C%2522instrumentSelect_5%2522%253A%2522122%2522%252C%2522sfIndex_5%2522%253A%25229%2522%252C%2522reverbSlider_5%2522%253A%25220.8%2522%257D%252C%25226%2522%253A%257B%2522volumeSlider_6%2522%253A%252233%2522%252C%2522panSlider_6%2522%253A%2522-0.63%2522%252C%2522instrumentSelect_6%2522%253A%2522107%2522%252C%2522reverbSlider_6%2522%253A%25220.5%2522%252C%2522sfIndex_6%2522%253A%25221%2522%257D%252C%25227%2522%253A%257B%2522volumeSlider_7%2522%253A%252240%2522%252C%2522instrumentSelect_7%2522%253A%2522104%2522%252C%2522panSlider_7%2522%253A%2522-0.01%2522%252C%2522sfIndex_7%2522%253A%25221%2522%252C%2522reverbSlider_7%2522%253A%25220.47%2522%252C%2522volumeSlider_drum%2522%253A%2522120%2522%257D%252C%25228%2522%253A%257B%2522volumeSlider_8%2522%253A%2522111%2522%252C%2522instrumentSelect_8%2522%253A%2522115%2522%252C%2522panSlider_8%2522%253A%25220.84%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectClosed%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectLow%2520Tom%25201%2522%253A2%252C%2522drumNoteSelectLow%2520Tom%25202%2522%253A2%252C%2522drumNoteSelectPedal%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectBass%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectCrash%2520Cymbal%25201%2522%253A2%252C%2522drumNoteSelectCrash%2520Cymbal%25202%2522%253A2%252C%2522volumeSlider_drum%2522%253A%2522107%2522%257D%252C%252210%2522%253A%257B%2522volumeSlider_10%2522%253A%252238%2522%252C%2522panSlider_10%2522%253A%25220.67%2522%252C%2522instrumentSelect_10%2522%253A%2522108%2522%252C%2522sfIndex_10%2522%253A%25221%2522%252C%2522volumeSlider_drum%2522%253A%2522122%2522%252C%2522reverbSlider_10%2522%253A%25220.82%2522%257D%252C%252215%2522%253A%257B%2522volumeSlider_15%2522%253A%2522127%2522%252C%2522volumeSlider_drum%2522%253A%2522107%2522%252C%2522panSlider_15%2522%253A%2522-0.61%2522%257D%257D&perOktave=1&mode=2&negRoot=61&reverbGain=1.5&irUrl=2), override single drumSounds to another (notes on drumchannel 10), or switch to another soundfont.

## Modes

- **Normal**: Simple MIDI playback.
- **Left-hand Piano**: Inverts notes around middle D (MIDI number 62), except for drum channel 10.
- **Negative Harmony**: Inverts notes around the root's thirds, except for drum channel 10. The axis lies between major and minor 3rds, so the latter becomes the former, the root becomes the 5th, and vice versa. The root of the loaded MIDI file is detected automatically.

For the last two modes pitch bend messages are turned upside down as well.

## Per Octave

Negative harmony inverts the piece, making the bass the highest voice for example. You can invert notes per octave for left-hand and negative harmony modes, keeping everything close to its original place. This may cause melodies to switch octaves unexpectedly. Changing the root of the piece shifts this point and transposes the negatively harmonized tune.

## Sharing

If you pasted an url a share button will be provided. The url shared will include the linked file and any change you made to instruments settings.
Settings shared this way will override any midi control message in the file. Thus you can change for example also the [intrumentation of a piece](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F27670.mid&channels=%257B%25220%2522%253A%257B%2522instrumentSelect_0%2522%253A%252218%2522%252C%2522panSlider_0%2522%253A%2522-0.55%2522%252C%2522reverbSlider_0%2522%253A%25220.29%2522%252C%2522volumeSlider_0%2522%253A%252244%2522%257D%252C%25221%2522%253A%257B%2522instrumentSelect_1%2522%253A%252218%2522%252C%2522panSlider_1%2522%253A%2522-0.64%2522%252C%2522reverbSlider_1%2522%253A%25220.26%2522%252C%2522sfIndex_1%2522%253A%25221%2522%252C%2522volumeSlider_1%2522%253A%252239%2522%257D%252C%25222%2522%253A%257B%2522instrumentSelect_2%2522%253A%252218%2522%252C%2522panSlider_2%2522%253A%2522-0.77%2522%252C%2522reverbSlider_2%2522%253A%25220.22%2522%252C%2522sfIndex_2%2522%253A%25221%2522%252C%2522volumeSlider_2%2522%253A%252235%2522%257D%252C%25223%2522%253A%257B%2522instrumentSelect_3%2522%253A%252232%2522%252C%2522panSlider_3%2522%253A%25220.66%2522%252C%2522sfIndex_3%2522%253A%25220%2522%252C%2522volumeSlider_3%2522%253A%2522127%2522%252C%2522reverbSlider_3%2522%253A%25220.47%2522%257D%252C%25224%2522%253A%257B%2522instrumentSelect_4%2522%253A%252264%2522%252C%2522volumeSlider_4%2522%253A%252297%2522%252C%2522reverbSlider_4%2522%253A%25220.9%2522%257D%257D&perOktave=1&mode=2&negRoot=59&reverbGain=0.21&irUrl=3&speed=0.98)

## Examples

- [The Four Seasons op8 n2 RV315 ''Summer'' 3mov Presto](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F31387.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%2522-0.01%2522%252C%2522instrumentSelect_0%2522%253A%25227%2522%252C%2522volumeSlider_0%2522%253A%252263%2522%257D%252C%25221%2522%253A%257B%2522panSlider_1%2522%253A%2522-0.85%2522%252C%2522volumeSlider_1%2522%253A%252294%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%25220.6%2522%252C%2522volumeSlider_2%2522%253A%2522119%2522%252C%2522sfIndex_2%2522%253A%25221%2522%257D%252C%25223%2522%253A%257B%2522instrumentSelect_3%2522%253A%2522110%2522%252C%2522panSlider_3%2522%253A%2522-0.53%2522%252C%2522volumeSlider_3%2522%253A%2522101%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%25220.49%2522%252C%2522instrumentSelect_4%2522%253A%2522110%2522%252C%2522sfIndex_4%2522%253A%25224%2522%252C%2522volumeSlider_4%2522%253A%2522112%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%25220.39%2522%252C%2522sfIndex_5%2522%253A%25220%2522%252C%2522instrumentSelect_5%2522%253A%252249%2522%257D%252C%25226%2522%253A%257B%2522sfIndex_6%2522%253A%25220%2522%252C%2522panSlider_6%2522%253A%25220.62%2522%252C%2522instrumentSelect_6%2522%253A%252242%2522%252C%2522volumeSlider_6%2522%253A%2522100%2522%257D%252C%25227%2522%253A%257B%2522volumeSlider_7%2522%253A%2522104%2522%257D%252C%25228%2522%253A%257B%2522panSlider_8%2522%253A%2522-0.42%2522%252C%2522sfIndex_8%2522%253A%25224%2522%257D%252C%252210%2522%253A%257B%2522panSlider_10%2522%253A%2522-0.3%2522%257D%252C%252211%2522%253A%257B%2522panSlider_11%2522%253A%25220.47%2522%257D%252C%252212%2522%253A%257B%2522panSlider_12%2522%253A%2522-0.34%2522%252C%2522sfIndex_12%2522%253A%25220%2522%252C%2522instrumentSelect_12%2522%253A%252241%2522%257D%252C%252213%2522%253A%257B%2522sfIndex_13%2522%253A%25221%2522%252C%2522instrumentSelect_13%2522%253A%252243%2522%252C%2522volumeSlider_13%2522%253A%2522111%2522%252C%2522panSlider_13%2522%253A%2522-0.25%2522%257D%252C%252214%2522%253A%257B%2522panSlider_14%2522%253A%2522-0.07%2522%257D%257D&perOktave=1&mode=2&negRoot=65&reverbGain=1.45&irUrl=2) - [The Four Seasons op8 n1 RV269 ''Spring'' 1mov Allegro](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F31387.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%2522-0.01%2522%252C%2522instrumentSelect_0%2522%253A%25227%2522%252C%2522volumeSlider_0%2522%253A%252263%2522%257D%252C%25221%2522%253A%257B%2522panSlider_1%2522%253A%2522-0.85%2522%252C%2522volumeSlider_1%2522%253A%252294%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%25220.6%2522%252C%2522volumeSlider_2%2522%253A%2522119%2522%252C%2522sfIndex_2%2522%253A%25221%2522%257D%252C%25223%2522%253A%257B%2522instrumentSelect_3%2522%253A%2522110%2522%252C%2522panSlider_3%2522%253A%2522-0.53%2522%252C%2522volumeSlider_3%2522%253A%2522101%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%25220.49%2522%252C%2522instrumentSelect_4%2522%253A%2522110%2522%252C%2522sfIndex_4%2522%253A%25224%2522%252C%2522volumeSlider_4%2522%253A%2522112%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%25220.39%2522%252C%2522sfIndex_5%2522%253A%252213%2522%252C%2522instrumentSelect_5%2522%253A%252249%2522%257D%252C%25226%2522%253A%257B%2522sfIndex_6%2522%253A%252219%2522%252C%2522panSlider_6%2522%253A%25220.62%2522%252C%2522instrumentSelect_6%2522%253A%252242%2522%257D%252C%25227%2522%253A%257B%2522volumeSlider_7%2522%253A%2522104%2522%257D%252C%25228%2522%253A%257B%2522panSlider_8%2522%253A%2522-0.42%2522%252C%2522sfIndex_8%2522%253A%25224%2522%257D%252C%252210%2522%253A%257B%2522panSlider_10%2522%253A%2522-0.3%2522%257D%252C%252211%2522%253A%257B%2522panSlider_11%2522%253A%25220.47%2522%257D%252C%252212%2522%253A%257B%2522panSlider_12%2522%253A%2522-0.34%2522%252C%2522sfIndex_12%2522%253A%25225%2522%252C%2522instrumentSelect_12%2522%253A%252241%2522%257D%252C%252213%2522%253A%257B%2522sfIndex_13%2522%253A%25221%2522%252C%2522instrumentSelect_13%2522%253A%252248%2522%257D%252C%252214%2522%253A%257B%2522panSlider_14%2522%253A%25220.74%2522%257D%257D&perOktave=1&mode=2.0&irUrl=2&negRoot=65&reverbGain=1.45)
- [Could you be loved](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F72436.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%25220.65%2522%252C%2522volumeSlider_0%2522%253A%252275%2522%252C%2522sfIndex_0%2522%253A%25221%2522%257D%252C%25221%2522%253A%257B%2522panSlider_1%2522%253A%25220.02%2522%252C%2522instrumentSelect_1%2522%253A%252233%2522%252C%2522volumeSlider_1%2522%253A%2522121%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-0.84%2522%252C%2522volumeSlider_2%2522%253A%2522101%2522%252C%2522sfIndex_2%2522%253A%25227%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%2522-0.04%2522%252C%2522instrumentSelect_3%2522%253A%252289%2522%252C%2522sfIndex_3%2522%253A%25224%2522%252C%2522volumeSlider_3%2522%253A%252251%2522%252C%2522reverbSlider_3%2522%253A%25221%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_4%2522%253A%252293%2522%257D%252C%25227%2522%253A%257B%2522volumeSlider_7%2522%253A%2522121%2522%252C%2522reverbSlider_7%2522%253A%25220.33%2522%252C%2522instrumentSelect_7%2522%253A%252225%2522%252C%2522panSlider_7%2522%253A%25220%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectBass%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25202%2522%253A2%252C%2522drumNoteSelectClaves%2522%253A2%252C%2522drumNoteSelectClosed%2520Hi-hat%2522%253A0%252C%2522drumNoteSelectOpen%2520Cuica%2522%253A4%257D%257D&perOktave=1&mode=2&negRoot=64&irUrl=1&speed=1.13&reverbGain=0.62) - [Is this love](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F72441.mid&channels=%257B%25221%2522%253A%257B%2522instrumentSelect_1%2522%253A%252232%2522%252C%2522volumeSlider_1%2522%253A%2522116%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-1%2522%252C%2522volumeSlider_2%2522%253A%252290%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%2522-0.38%2522%252C%2522volumeSlider_4%2522%253A%252292%2522%257D%252C%25225%2522%253A%257B%2522instrumentSelect_5%2522%253A%252277%2522%252C%2522volumeSlider_5%2522%253A%2522117%2522%257D%252C%25226%2522%253A%257B%2522panSlider_6%2522%253A%25220.95%2522%257D%252C%25227%2522%253A%257B%2522panSlider_7%2522%253A%25220.6%2522%257D%252C%25228%2522%253A%257B%2522panSlider_8%2522%253A%2522-0.58%2522%257D%257D&perOktave=1&mode=2.0&irUrl=2&negRoot=62&reverbGain=1.06&speed=1.2) - [ Three little birds](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F72447.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%25221%2522%252C%2522volumeSlider_0%2522%253A%252273%2522%252C%2522reverbSlider_0%2522%253A%25220.03%2522%257D%252C%25221%2522%253A%257B%2522instrumentSelect_1%2522%253A%252237%2522%252C%2522reverbSlider_1%2522%253A%25220%2522%252C%2522volumeSlider_1%2522%253A%2522107%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-0.46%2522%252C%2522instrumentSelect_2%2522%253A%252267%2522%252C%2522volumeSlider_2%2522%253A%252284%2522%252C%2522reverbSlider_2%2522%253A%25220.85%2522%257D%252C%25223%2522%253A%257B%2522reverbSlider_3%2522%253A%25220.58%2522%252C%2522volumeSlider_3%2522%253A%252287%2522%252C%2522panSlider_3%2522%253A%25220.05%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%2522-0.46%2522%252C%2522reverbSlider_4%2522%253A%25220%2522%252C%2522volumeSlider_4%2522%253A%252271%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%2522-1%2522%252C%2522reverbSlider_5%2522%253A%25220.41%2522%257D%252C%25226%2522%253A%257B%2522panSlider_6%2522%253A%25221%2522%252C%2522reverbSlider_6%2522%253A%25220.48%2522%257D%257D&perOktave=1&mode=2&irUrl=3&negRoot=65&reverbGain=0.27&speed=0.79) - [I shot the sheriff](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F24367.mid&channels=%257B%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%252294%2522%252C%2522reverbSlider_2%2522%253A%25220.68%2522%252C%2522instrumentSelect_2%2522%253A%25221%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%2522-0.02%2522%252C%2522volumeSlider_3%2522%253A%252263%2522%252C%2522reverbSlider_3%2522%253A%25220.92%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%25221%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%25220.34%2522%252C%2522volumeSlider_5%2522%253A%252250%2522%252C%2522reverbSlider_5%2522%253A%25220.79%2522%257D%252C%25226%2522%253A%257B%2522panSlider_6%2522%253A%2522-0.6%2522%252C%2522volumeSlider_6%2522%253A%252288%2522%257D%252C%25227%2522%253A%257B%2522panSlider_7%2522%253A%25220.56%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectBass%2520Drum%25202%2522%253A3%252C%2522drumNoteSelectClosed%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25202%2522%253A1%257D%257D&perOktave=1&mode=2.0&irUrl=0&negRoot=58&speed=0.83&reverbGain=0.67) - [Exodus](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F72438.mid&channels=%257B%25221%2522%253A%257B%2522sfIndex_1%2522%253A%25223%2522%252C%2522reverbSlider_1%2522%253A%25220%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-0.02%2522%252C%2522volumeSlider_2%2522%253A%2522115%2522%257D%252C%25223%2522%253A%257B%2522volumeSlider_3%2522%253A%2522103%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%25220.19%2522%252C%2522volumeSlider_4%2522%253A%252290%2522%252C%2522reverbSlider_4%2522%253A%25220%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%2522119%2522%252C%2522panSlider_5%2522%253A%2522-0.37%2522%257D%252C%25226%2522%253A%257B%2522panSlider_6%2522%253A%25221%2522%257D%252C%25227%2522%253A%257B%2522sfIndex_7%2522%253A%25226%2522%257D%252C%25228%2522%253A%257B%2522panSlider_8%2522%253A%2522-0.7%2522%252C%2522volumeSlider_8%2522%253A%252271%2522%257D%252C%252210%2522%253A%257B%2522reverbSlider_10%2522%253A%25220%2522%252C%2522volumeSlider_10%2522%253A%252237%2522%257D%252C%252215%2522%253A%257B%2522volumeSlider_15%2522%253A%252294%2522%257D%257D&perOktave=1&mode=2&irUrl=1&negRoot=60&speed=1.06&reverbGain=0.26) - [Jammin](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F72442.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%25220.83%2522%257D%252C%25221%2522%253A%257B%2522instrumentSelect_1%2522%253A%252233%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-1%2522%257D%252C%25223%2522%253A%257B%2522volumeSlider_3%2522%253A%252286%2522%252C%2522panSlider_3%2522%253A%25221%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_4%2522%253A%252283%2522%252C%2522panSlider_4%2522%253A%2522-0.38%2522%252C%2522reverbSlider_4%2522%253A%25220.97%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%2522127%2522%252C%2522reverbSlider_5%2522%253A%25220%2522%252C%2522sfIndex_5%2522%253A%25225%2522%252C%2522instrumentSelect_5%2522%253A%252217%2522%257D%252C%25226%2522%253A%257B%2522reverbSlider_6%2522%253A%25221%2522%252C%2522instrumentSelect_6%2522%253A%2522107%2522%252C%2522panSlider_6%2522%253A%25220.93%2522%252C%2522volumeSlider_6%2522%253A%2522113%2522%257D%252C%25227%2522%253A%257B%2522panSlider_7%2522%253A%25220.24%2522%252C%2522volumeSlider_7%2522%253A%2522109%2522%252C%2522reverbSlider_7%2522%253A%25220.76%2522%252C%2522sfIndex_7%2522%253A%25228%2522%257D%252C%25228%2522%253A%257B%2522sfIndex_8%2522%253A%252210%2522%252C%2522panSlider_8%2522%253A%25220.3%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectBass%2520Drum%25202%2522%253A1%252C%2522volumeSlider_drum%2522%253A%2522127%2522%257D%257D&perOktave=1&mode=2&irUrl=1&negRoot=61&speed=1.18&reverbGain=0.64)
- [Highway to hell](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F3651.mid&channels=%257B%25220%2522%253A%257B%2522volumeSlider_0%2522%253A%2522127%2522%252C%2522reverbSlider_0%2522%253A%25220%2522%252C%2522panSlider_0%2522%253A%25220.96%2522%252C%2522sfIndex_0%2522%253A%25226%2522%257D%252C%25221%2522%253A%257B%2522volumeSlider_1%2522%253A%252223%2522%252C%2522panSlider_1%2522%253A%2522-0.68%2522%252C%2522reverbSlider_1%2522%253A%25220.75%2522%257D%252C%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%2522127%2522%252C%2522instrumentSelect_2%2522%253A%252276%2522%252C%2522reverbSlider_2%2522%253A%25221%2522%252C%2522panSlider_2%2522%253A%2522-0.15%2522%257D%252C%25223%2522%253A%257B%2522reverbSlider_3%2522%253A%25220%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectClosed%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectBass%2520Drum%25202%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25202%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25201%2522%253A2%257D%257D&perOktave=1&mode=2&negRoot=59&reverbGain=1.5&irUrl=2&speed=1.24)
- [Morning mood](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F35033.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%2522-0.63%2522%252C%2522instrumentSelect_0%2522%253A%252273%2522%252C%2522sfIndex_0%2522%253A%25224%2522%252C%2522volumeSlider_0%2522%253A%252294%2522%252C%2522reverbSlider_0%2522%253A%25220.87%2522%257D%252C%25221%2522%253A%257B%2522sfIndex_1%2522%253A%25221%2522%252C%2522panSlider_1%2522%253A%25220.53%2522%257D%252C%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%252277%2522%252C%2522panSlider_2%2522%253A%2522-0.12%2522%252C%2522reverbSlider_2%2522%253A%25220.78%2522%257D%252C%25223%2522%253A%257B%2522volumeSlider_3%2522%253A%252236%2522%252C%2522panSlider_3%2522%253A%25220.72%2522%252C%2522sfIndex_3%2522%253A%25221%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_4%2522%253A%252290%2522%252C%2522panSlider_4%2522%253A%25220.49%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%2522-0.41%2522%252C%2522volumeSlider_5%2522%253A%252278%2522%257D%252C%25226%2522%253A%257B%2522panSlider_6%2522%253A%25220.54%2522%252C%2522volumeSlider_6%2522%253A%252226%2522%257D%252C%25228%2522%253A%257B%2522volumeSlider_8%2522%253A%252280%2522%257D%252C%252210%2522%253A%257B%2522instrumentSelect_10%2522%253A%252248%2522%252C%2522panSlider_10%2522%253A%2522-0.63%2522%252C%2522volumeSlider_10%2522%253A%252277%2522%257D%252C%252211%2522%253A%257B%2522instrumentSelect_11%2522%253A%252249%2522%252C%2522panSlider_11%2522%253A%2522-0.1%2522%257D%252C%252212%2522%253A%257B%2522instrumentSelect_12%2522%253A%252249%2522%252C%2522reverbSlider_12%2522%253A%25220.6%2522%252C%2522panSlider_12%2522%253A%25220.1%2522%257D%252C%252213%2522%253A%257B%2522panSlider_13%2522%253A%25220.98%2522%252C%2522instrumentSelect_13%2522%253A%252248%2522%257D%252C%252214%2522%253A%257B%2522instrumentSelect_14%2522%253A%252249%2522%252C%2522volumeSlider_14%2522%253A%252281%2522%252C%2522panSlider_14%2522%253A%25220.72%2522%257D%257D&perOktave=1&mode=2&negRoot=65&reverbGain=0.3&irUrl=3&speed=0.72)
- [Schism](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F104881.mid&channels=%257B%25220%2522%253A%257B%2522instrumentSelect_0%2522%253A%2522104%2522%252C%2522panSlider_0%2522%253A%2522-0.61%2522%252C%2522volumeSlider_0%2522%253A%2522119%2522%252C%2522reverbSlider_0%2522%253A%25220.73%2522%252C%2522sfIndex_0%2522%253A%25224%2522%257D%252C%25221%2522%253A%257B%2522panSlider_1%2522%253A%25220.68%2522%252C%2522volumeSlider_1%2522%253A%252248%2522%252C%2522reverbSlider_1%2522%253A%25220.51%2522%252C%2522instrumentSelect_1%2522%253A%2522111%2522%257D%252C%25222%2522%253A%257B%2522panSlider_2%2522%253A%2522-0.07%2522%252C%2522instrumentSelect_2%2522%253A%2522107%2522%252C%2522volumeSlider_2%2522%253A%2522110%2522%252C%2522reverbSlider_2%2522%253A%25220.78%2522%252C%2522sfIndex_2%2522%253A%25227%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%25220.17%2522%252C%2522volumeSlider_3%2522%253A%2522127%2522%252C%2522instrumentSelect_3%2522%253A%252276%2522%252C%2522sfIndex_3%2522%253A%25221%2522%252C%2522reverbSlider_3%2522%253A%25220.76%2522%257D%252C%25224%2522%253A%257B%2522reverbSlider_4%2522%253A%25221%2522%252C%2522panSlider_4%2522%253A%25220.16%2522%252C%2522volumeSlider_4%2522%253A%252290%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%25220.43%2522%252C%2522instrumentSelect_5%2522%253A%2522121%2522%252C%2522sfIndex_5%2522%253A%25224%2522%252C%2522volumeSlider_5%2522%253A%252287%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectBass%2520Drum%25202%2522%253A3%252C%2522drumNoteSelectMid%2520Tom%25201%2522%253A1%252C%2522drumNoteSelectCrash%2520Cymbal%25202%2522%253A2%252C%2522drumNoteSelectChinese%2520Cymbal%2522%253A1%252C%2522drumNoteSelectClosed%2520Hi-hat%2522%253A1%252C%2522drumNoteSelectSplash%2520Cymbal%2522%253A2%252C%2522drumNoteSelectSnare%2520Drum%25202%2522%253A2%252C%2522drumNoteSelectHigh%2520Tom%25201%2522%253A2%252C%2522drumNoteSelectLow%2520Tom%25202%2522%253A1%252C%2522drumNoteSelectLow%2520Tom%25201%2522%253A4%252C%2522drumNoteSelectSnare%2520Drum%25201%2522%253A1%257D%257D&perOktave=1&mode=2.0&irUrl=3&negRoot=61&speed=1.12&reverbGain=0.16)
- [Englishman in New York](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F97219.mid&channels=%257B%25221%2522%253A%257B%2522volumeSlider_1%2522%253A%2522115%2522%252C%2522panSlider_1%2522%253A%25220.03%2522%252C%2522reverbSlider_1%2522%253A%25220.14%2522%252C%2522instrumentSelect_1%2522%253A%252237%2522%257D%252C%25222%2522%253A%257B%2522reverbSlider_2%2522%253A%25220.43%2522%252C%2522panSlider_2%2522%253A%25220.4%2522%252C%2522volumeSlider_2%2522%253A%252220%2522%257D%252C%25223%2522%253A%257B%2522reverbSlider_3%2522%253A%25220.91%2522%252C%2522panSlider_3%2522%253A%2522-0.21%2522%252C%2522volumeSlider_3%2522%253A%2522108%2522%252C%2522instrumentSelect_3%2522%253A%252270%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_4%2522%253A%2522127%2522%252C%2522panSlider_4%2522%253A%25220.62%2522%252C%2522reverbSlider_4%2522%253A%25220.37%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%252272%2522%252C%2522panSlider_5%2522%253A%2522-0.29%2522%257D%252C%25226%2522%253A%257B%2522volumeSlider_6%2522%253A%2522108%2522%252C%2522panSlider_6%2522%253A%25220.39%2522%257D%252C%25227%2522%253A%257B%2522panSlider_7%2522%253A%25220.69%2522%252C%2522sfIndex_7%2522%253A%25224%2522%257D%252C%25228%2522%253A%257B%2522volumeSlider_8%2522%253A%252219%2522%252C%2522panSlider_8%2522%253A%2522-0.94%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectChinese%2520Cymbal%2522%253A2%252C%2522drumNoteSelectTambourine%2522%253A2%257D%252C%252210%2522%253A%257B%2522panSlider_10%2522%253A%2522-0.81%2522%252C%2522volumeSlider_10%2522%253A%252226%2522%252C%2522reverbSlider_10%2522%253A%25220.18%2522%257D%252C%252211%2522%253A%257B%2522panSlider_11%2522%253A%2522-0.69%2522%252C%2522volumeSlider_11%2522%253A%252288%2522%252C%2522instrumentSelect_11%2522%253A%252276%2522%257D%252C%252212%2522%253A%257B%2522volumeSlider_12%2522%253A%252227%2522%252C%2522panSlider_12%2522%253A%25220.8%2522%257D%257D&perOktave=1&mode=2&negRoot=59&reverbGain=0.13&irUrl=3&speed=0.98) - [Every Breath You Take](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F44563.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%2522-0.42%2522%252C%2522volumeSlider_0%2522%253A%2522110%2522%252C%2522reverbSlider_0%2522%253A%25220.67%2522%257D%252C%25221%2522%253A%257B%2522reverbSlider_1%2522%253A%25220%2522%252C%2522volumeSlider_1%2522%253A%2522127%2522%252C%2522programChange_1%2522%253A%25220%2522%257D%252C%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%252291%2522%257D%252C%25223%2522%253A%257B%2522volumeSlider_3%2522%253A%252293%2522%252C%2522panSlider_3%2522%253A%2522-0.08%2522%252C%2522reverbSlider_3%2522%253A%25220.94%2522%252C%2522instrumentSelect_3%2522%253A%252269%2522%257D%252C%25224%2522%253A%257B%2522volumeSlider_drum%2522%253A%2522127%2522%252C%2522panSlider_4%2522%253A%25220.37%2522%252C%2522reverbSlider_4%2522%253A%25220.69%2522%252C%2522volumeSlider_4%2522%253A%2522119%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%252252%2522%252C%2522reverbSlider_5%2522%253A%25220.36%2522%252C%2522panSlider_5%2522%253A%2522-0.53%2522%257D%252C%25226%2522%253A%257B%2522reverbSlider_6%2522%253A%25220.71%2522%252C%2522panSlider_6%2522%253A%25220.53%2522%257D%252C%25227%2522%253A%257B%2522volumeSlider_7%2522%253A%252255%2522%252C%2522panSlider_7%2522%253A%2522-0.41%2522%257D%252C%25228%2522%253A%257B%2522volumeSlider_8%2522%253A%252276%2522%252C%2522panSlider_8%2522%253A%2522-0.34%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectSnare%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectBass%2520Drum%25201%2522%253A1%252C%2522drumNoteSelectRide%2520Cymbal%25201%2522%253A4%252C%2522drumNoteSelectRide%2520Bell%2522%253A4%252C%2522drumNoteSelectCrash%2520Cymbal%25201%2522%253A2%252C%2522drumNoteSelectClosed%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectPedal%2520Hi-hat%2522%253A2%257D%252C%252210%2522%253A%257B%2522panSlider_10%2522%253A%2522-0.39%2522%257D%252C%252215%2522%253A%257B%2522volumeSlider_drum%2522%253A%2522127%2522%257D%257D&perOktave=1&mode=2&negRoot=56&reverbGain=0.23&irUrl=3&speed=1.07)
- [Summertime Blues](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F3238.mid&channels=%257B%25220%2522%253A%257B%2522panSlider_0%2522%253A%2522-0.38%2522%252C%2522reverbSlider_0%2522%253A%25220.43%2522%257D%252C%25221%2522%253A%257B%2522reverbSlider_1%2522%253A%25220%2522%257D%252C%25222%2522%253A%257B%2522reverbSlider_2%2522%253A%25220%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%25220.03%2522%252C%2522volumeSlider_3%2522%253A%252296%2522%252C%2522instrumentSelect_3%2522%253A%2522110%2522%252C%2522reverbSlider_3%2522%253A%25220.43%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%25220.96%2522%252C%2522reverbSlider_4%2522%253A%25220.32%2522%252C%2522volumeSlider_4%2522%253A%252288%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%2522-0.63%2522%252C%2522volumeSlider_5%2522%253A%252277%2522%252C%2522reverbSlider_5%2522%253A%25220.22%2522%257D%252C%25226%2522%253A%257B%2522reverbSlider_6%2522%253A%25220.39%2522%257D%252C%25227%2522%253A%257B%2522panSlider_7%2522%253A%25220.66%2522%252C%2522reverbSlider_7%2522%253A%25220.38%2522%257D%252C%25228%2522%253A%257B%2522reverbSlider_8%2522%253A%25220.45%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectSnare%2520Drum%25202%2522%253A2%252C%2522drumNoteSelectBass%2520Drum%25202%2522%253A3%257D%252C%252215%2522%253A%257B%2522panSlider_15%2522%253A%2522-0.61%2522%252C%2522volumeSlider_15%2522%253A%252247%2522%252C%2522reverbSlider_15%2522%253A%25220.7%2522%257D%257D&perOktave=1&mode=2.0&irUrl=0&negRoot=61&reverbGain=0.17&speed=1.48)
- [Don’t get around much anymore](https://reinissance.github.io/negative-Harmony/index.html?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F41812.mid&channels=%257B%25222%2522%253A%257B%2522panSlider_2%2522%253A%25220.66%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%2522-0.47%2522%252C%2522instrumentSelect_4%2522%253A%252261%2522%252C%2522volumeSlider_4%2522%253A%2522127%2522%257D%252C%25225%2522%253A%257B%2522panSlider_5%2522%253A%25220.41%2522%252C%2522volumeSlider_5%2522%253A%252283%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectSnare%2520Drum%25201%2522%253A3%252C%2522drumNoteSelectRide%2520Cymbal%25201%2522%253A0%252C%2522drumNoteSelectBass%2520Drum%25201%2522%253A3%252C%2522volumeSlider_drum%2522%253A%2522115%2522%257D%257D&perOktave=1&mode=2&irUrl=0&negRoot=63&reverbGain=0.29&speed=1.27)
- [With a little help](https://reinissance.github.io/negative-Harmony/?midiFile=https%3A%2F%2Fbitmidi.com%2Fuploads%2F16431.mid&channels=%257B%25222%2522%253A%257B%2522volumeSlider_2%2522%253A%252231%2522%252C%2522panSlider_2%2522%253A%2522-0.76%2522%252C%2522sfIndex_2%2522%253A%25224%2522%257D%252C%25223%2522%253A%257B%2522panSlider_3%2522%253A%2522-0.21%2522%252C%2522volumeSlider_3%2522%253A%252284%2522%252C%2522instrumentSelect_3%2522%253A%252275%2522%257D%252C%25224%2522%253A%257B%2522panSlider_4%2522%253A%25221%2522%252C%2522volumeSlider_4%2522%253A%252293%2522%257D%252C%25225%2522%253A%257B%2522volumeSlider_5%2522%253A%252263%2522%252C%2522panSlider_5%2522%253A%2522-0.77%2522%252C%2522reverbSlider_5%2522%253A%25220.9%2522%257D%252C%25226%2522%253A%257B%2522volumeSlider_6%2522%253A%252253%2522%252C%2522panSlider_6%2522%253A%2522-0.87%2522%257D%252C%25229%2522%253A%257B%2522drumNoteSelectSnare%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectBass%2520Drum%25201%2522%253A2%252C%2522drumNoteSelectPedal%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectClosed%2520Hi-hat%2522%253A2%252C%2522drumNoteSelectCrash%2520Cymbal%25201%2522%253A2%252C%2522drumNoteSelectCabasa%2522%253A4%252C%2522volumeSlider_drum%2522%253A%2522106%2522%257D%257D&perOktave=1&mode=2&negRoot=64&reverbGain=0.6&irUrl=2&speed=1.2)

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