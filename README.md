# Playable Quotes for Game Boy

This project offers the ability to create and share **playable quotes** of [GameBoy](https://en.wikipedia.org/wiki/Game_Boy) games. A playable quote is a *delimited* reference to a 
*specific* moment in a game along with a reference recording of how that moment plays out.


## Watching a Quote

Drag a compatible `.png` file onto the player to get started. Once it loads, you'll see a looping animation of the reference recording of that moment of play.

## Riffing on a Quote

While watching a quote, you use your keyboard to grab control of the game and start playing it in your own way. If your riff on the quote reaches out of the bounds of the original quote, the game will reset to the start of the quote with you still in control.

## Insert ROM to Continue

If you have access to the ROM for the quoted game (or any other GameBoy game), you can drop that ROM image (typically a `.gb` file) onto the player. If your ROM is compatible with the current quote, you can continue unlimited play of the game from the quoted starting point. Otherwise, we'll let you play that new game from the start. You can find some ROM images on [archive.org](https://archive.org/download/game-boy-romset-ultra-us).

## Recording a Quote

While playing a game (after you've provided the ROM), you can use the button record your own quote. As you play, we'll estimate how much of the ROM will be included in your quote. When you are done recording, use the button to compile the quote to a shareable `.png` file.

### Recording Tips

- Try to keep your recorded activity within a single mode or screen of the game. This will keep the quote files small.

- Remember that viewers of the quote can mostly only see or do things that you see or do in your recording. The quote compiler includes a little bit of extra data to avoid making overly brittle quotes (ones where it is too easy to reach out of bounds), but you the quote-maker need to do most of the work.

- Try to start your recording from a *quiet* moment in the game (e.g. character standing still in a safe position). This will make it easier for viewers riffing on your quote to assume control without immediately exceeding the quote bounds. Relatedly, let go of all controls before starting a recording so that the recording doesn't begin with one of the buttons stuck down unexpectedly.

## "Is sharing playable quotes legal?"

We aren't intellectual property laywers, but by the same reasoning that [Google can distribute delimited "snippets" of the books that they've scanned](https://www.theatlantic.com/technology/archive/2015/10/fair-use-transformative-leval-google-books/411058/), we think that sharing these playable quotes should be safe.


## Credits

- `gameboy.js`: [Guillermo Rauch's cleanup](https://github.com/rauchg/gameboy) of [Grant Galitz's GameBoy-Online](https://github.com/taisel/GameBoy-Online).
- `state-machine.js`: [Jake Gordon's Javascript State Machine](https://github.com/jakesgordon/javascript-state-machine).
- `png-baker.js`: A slightly modified version of [Atul Varma's png-baker.js](https://github.com/toolness/png-baker.js) to support binary chunks.
- `jszip.min.js`: [JSZip](https://stuk.github.io/jszip/)
- `pako.min.js`: [pako](http://nodeca.github.io/pako/)
- `msgpack.js`: [msgpack-javascript](https://github.com/msgpack/msgpack-javascript)
- `emitter.js`: (where did we get this from?)