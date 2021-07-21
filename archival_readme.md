This archive represents a *playable quote* of a Game Boy game.

Playable quotes are delimited references to specific moments in a game along with a reference recording of how that moment of interactivity can play out.

* `rom.bin`: A Game Boy ROM image (comparable to many `.gb` files) with many bytes zeroed out. While the format of this file mostly matches that used by menu emulators, this ROM image *cannot* be used to boot the game.


* `romMask.bin`: This file is the same size as `rom.bin`, but it uses values 1 (valid) and 0 (invalid) to indicate which bytes of the ROM image are included in the quote. It should be possible to play back the recorded actions in the quote without ever reading from one of the invalid ROM addresses.

* `initialState.msgpack`: A [MessagePack](https://github.com/msgpack/msgpack-javascript) encoded savestate for a [specific Game Boy emulator](https://github.com/rauchg/gameboy). After decoding, entry 0 of the resulting array should be replaced with a reference to the contents of the ROM image above. Additionally, entry 71 should be replaced with a reference to a 160 * 144 entry Int32Array with the decoded contents of the encoding PNG file (representing the screen visible at the start of the recorded actions).

* `actions.msgpack`: A MessagePack-encoded array of instructions of which values to pass to `gameboy.JoyPadEvent` based on the number of previous calls to `gameboy.executeIteration`. Or maybe it is something like this. The format is currently changing, and this archive comes from a time when we hadn't worked out all of the details. Allowing the game to continue execution past the end of recorded actions (or attempting alternate)

Contact:
- Adam Smith (adam@adamsmith.as)
- Joël Franusic (joel@franusic.com)

