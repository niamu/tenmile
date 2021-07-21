This archive represents a playable quote of a Game Boy game.

Playable quotes are delimited references to specific moments in a game along with a reference recording of how that moment of interactivity can play out.

* `rom.bin`: A Game Boy ROM image (comparable to many `.gb` files) with many bytes zeroed out. While the format of this file mostly matches that used by menu emulators, this ROM image *cannot* be used to boot the game.


* `romMask.bin`: This file is the same size as `rom.bin`, but it uses values 1 (valid) and 0 (invalid) to indicate which bytes of the ROM image are included in the quote. It should be possible to play back the recorded actions in the quote without ever reading from one of the invalid ROM regions.



