# Playable Quotes for Game Boy

This project offers the ability to create and share **playable quotes** of [GameBoy](https://en.wikipedia.org/wiki/Game_Boy) games. A playable quote is a *delimited* reference to a 
*specific* moment in a game along with a reference recording of how that moment plays out.

## Running this project

*TODO: add some text describing how to run this project if it weren't being served by Glitch. If the instructions are complex, refer to a section later on for more details. We dont't expect many to try running the server themselves.*

## Watching a Quote

Drag a compatible `.png` file onto the player to get started. Once it loads, you'll see a looping animation of the reference recording from that moment of play.

## Riffing on a Quote

While watching a quote, you use your keyboard or on-screen buttons to grab control of the game and start playing it in your own way. If your riff on the quote reaches out of the bounds of the original quote, the system will reset to the start of the quote with you still in control.

## Insert ROM to Continue

If you have access to the ROM for the quoted game (or any other GameBoy game), you can drop that ROM image (typically a `.gb` or `.gbc` file) onto the player. If your ROM is compatible with the current quote, you can continue unlimited play of the game from the quoted starting point. Otherwise, we'll let you play that new game from the start. You can find some ROM images on [archive.org](https://archive.org/download/game-boy-romset-ultra-us).

## Recording a Quote

While playing a game (after you've provided the ROM), you can use the 
"Record a quote" button to record your own quote. As you play, we'll estimate how much of the ROM will be included in your quote. When you are done recording, use the button to compile the quote to a shareable `.png` file.

### Recording Tips

- Try to keep your recorded activity within a single mode or screen of the game. This will keep the quote files small.

- Remember that viewers of the quote can mostly only see or do things that you see or do in your recording. The quote compiler includes a little bit of extra data to avoid making overly brittle quotes (ones where it is too easy to reach out of bounds), but you the quote-maker need to do most of the work.

- Try to start your recording from a *quiet* moment in the game (e.g. character standing still in a safe position). This will make it easier for viewers riffing on your quote to assume control without immediately exceeding the quote bounds. Relatedly, let go of all controls before starting a recording so that the recording doesn't begin with one of the buttons stuck down unexpectedly.

### Quote File Structure and Size

During recording of a quote, you might see that you've accessed 1.5KB of ROM. However, the final quote file might be 35KB. What happened?

The quote file is larger for two big reasons. First, beyond including the slice of ROM data needed to play back your quote, we also include a snapshot of the Game Boy emulator's dynamic elements (e.g. unabridged RAM and other platform/cartridge state), an image of the screen at the first moment of your quote, and the recording of your inputs over time. We also include detailed information about the shape of the ROM slice so that we can keep others on the rails when they are riffing on your quote.

We also include more ROM bytes than just those that are touched during your recording. We include a subset of the ROM header (capturing the name of the game, the cartridge hardware type, etc.). Additionally, we include ROM bytes in pages/chunks larger with a granularity larger than a single byte. This creates quotes that are more robust to variation when riffing. By analogy to quoting text, we try to expand your quote out to the nearest paragraph boundary. We don't really know what counts as a paragraph, so we use fixed size memory pages as a crude proxy.

A zip file containing this data is steganographically encoded in the quote file. Packing the extra data into the quote file in this way is inefficient compared to simply concatenating the zip data onto the end of the png file, but it makes sure the extra data doesn't get lost when the image is losslessly recompressed.

## "Is sharing playable quotes legal?"

We aren't intellectual property laywers, but by the same reasoning that [Google can distribute delimited "snippets" of the books that they've scanned](https://www.theatlantic.com/technology/archive/2015/10/fair-use-transformative-leval-google-books/411058/), we think that sharing these playable quotes should be safe.

## Credits

By Adam Smith (adam@adamsmith.as) and Joël Franusic (joel@franusic.com) in the year 2021. `gameboy.js` is [Guillermo Rauch's cleanup](https://github.com/rauchg/gameboy) of [Grant Galitz's GameBoy-Online](https://github.com/taisel/GameBoy-Online). A few bugs in it have been fixed here but not upstreamed. We could use more help making replays deterministic.