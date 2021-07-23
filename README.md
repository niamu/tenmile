# Playable Quotes for Game Boy

This project offers the ability to create and share **playable quotes** of [GameBoy](https://en.wikipedia.org/wiki/Game_Boy) games. A playable quote is a *delimited* reference to a 
*specific* moment in a game along with a reference recording of how that moment plays out.


## Watching a Quote

Drag a compatible `.png` file onto the player to get started. Once it loads, you'll see a looping animation of the reference recording from that moment of play.

## Riffing on a Quote

While watching a quote, you use your keyboard to grab control of the game and start playing it in your own way. If your riff on the quote reaches out of the bounds of the original quote, the game will reset to the start of the quote with you still in control.

## Insert ROM to Continue

If you have access to the ROM for the quoted game (or any other GameBoy game), you can drop that ROM image (typically a `.gb` file) onto the player. If your ROM is compatible with the current quote, you can continue unlimited play of the game from the quoted starting point. Otherwise, we'll let you play that new game from the start. You can find some ROM images on [archive.org](https://archive.org/download/game-boy-romset-ultra-us).

## Recording a Quote

While playing a game (after you've provided the ROM), you can use the 
"Record a quote" button to record your own quote. As you play, we'll estimate how much of the ROM will be included in your quote. When you are done recording, use the button to compile the quote to a shareable `.png` file.

### Recording Tips

- Try to keep your recorded activity within a single mode or screen of the game. This will keep the quote files small.

- Remember that viewers of the quote can mostly only see or do things that you see or do in your recording. The quote compiler includes a little bit of extra data to avoid making overly brittle quotes (ones where it is too easy to reach out of bounds), but you the quote-maker need to do most of the work.

- Try to start your recording from a *quiet* moment in the game (e.g. character standing still in a safe position). This will make it easier for viewers riffing on your quote to assume control without immediately exceeding the quote bounds. Relatedly, let go of all controls before starting a recording so that the recording doesn't begin with one of the buttons stuck down unexpectedly.

### Quote File Structure and Size

During recording of a quote, you might see that you've accessed 1.5KB of ROM. However, the final quote file might be 35KB -- what happened?

The quote file is larger for two big reasons. First, beyond including the slice of ROM data needed to play back your quote, we also include a snapshot of the Game Boy emulator's dynamic elements (e.g. unabridged RAM and other platform/cartridge state), an image of the screen at the first moment of your quote, and the recording of your inputs over time. We also include detailed information about the shape of the ROM slice so that we can keep others on the rails when they are riffing on your quote.

We also include more ROM bytes than just those that are touched during your recording. We include a subset of the ROM header (capturing the name of the game, the cartridge hardware type, etc.). Additionally, we include ROM bytes in pages/chunks larger with a granularity larger than a single byte. This creates quotes that are more robust to variation when riffing. By analogy to quoting text, we try to expand your quote out to the nearest paragraph boundary. We don't really know what counts as a paragraph, so we use fixed size memory pages as a crude proxy.

If you rename the `.png` quote file to `.zip`, most unzipping tools will be able to show you the extra data encoded inside the quote file. A `README.md` file included inside the zip provides more detailed information about how your specific relates to the original ROM.


## "Is sharing playable quotes legal?"

We aren't intellectual property laywers, but by the same reasoning that [Google can distribute delimited "snippets" of the books that they've scanned](https://www.theatlantic.com/technology/archive/2015/10/fair-use-transformative-leval-google-books/411058/), we think that sharing these playable quotes should be safe.






## Credits

By Adam Smith (adam@adamsmith.as) and Joël Franusic (joel@franusic.com) in the year 2021.

- `gameboy.js`: [Guillermo Rauch's cleanup](https://github.com/rauchg/gameboy) of [Grant Galitz's GameBoy-Online](https://github.com/taisel/GameBoy-Online).
- `state-machine.js`: [Jake Gordon's Javascript State Machine](https://github.com/jakesgordon/javascript-state-machine).
- `png-baker.js`: A slightly modified version of [Atul Varma's png-baker.js](https://github.com/toolness/png-baker.js) to support binary chunks.
- `jszip.min.js`: [JSZip](https://stuk.github.io/jszip/)
- `pako.min.js`: [pako](http://nodeca.github.io/pako/)
- `msgpack.js`: [msgpack-javascript](https://github.com/msgpack/msgpack-javascript)
- `emitter.js`: [emitter](https://github.com/component/emitter)
- `XAudioServer.js`: (???)
- `resampler.js`: (???)