# Landing page outline

- # Playable Quotes for Game Boy
- This project offers the ability to create and share **playable quotes** of [Game Boy](https://en.wikipedia.org/wiki/Game_Boy) games. A playable quote is a *durable*, *delimited* reference to a 
*specific* moment in a game along with a reference *recording* of how that moment can play out.
- ## Quotes
- Quotes can allow players to share exciting moments and play styles from their favorite games, they can allow game publishers to tease content available in full games, and they can allow critics and educators to make convincing comparisons within and across the many moments in past games. These examples use commercial Game Boy games to illustrate potential use cases for playable quotes. Everything needed to reproduce each quote is contained within the `.png` files seen here. 
- {carousel with curated quotes list, links open in player}
- ## Games
- To record a new quote, you need access to a full game (typically a `.gb` or `.gbc` file). Try playing these freely licensed, homebrew games:
- {carousel with curated games list, links open in player}
- ## What's in a Quote File?
- The `.png` quote files used in this project also contain a `.zip` file. The zip contains a copy of the original game's ROM image with almost all entries (except those needed to play the quote) replaced by zeros. It also contains a state snapshot from our specially-repared Game Boy emulator along with a list of timed actions needed to reproduce the recorded gameplay. The zip file is steganographically encoded in the least significant bits of the image pixel data (8 bits per pixel) so that it is difficult for the informaiton about the ROM and savestate to become detached from the screenshot.
- ## Help Needed
- Robust playback: We need help further modifying an open-source Game Boy emulator in order to perfectly reproduce recorded gameplay given only the state snapshot and the recorded input events.
- More platforms: We need help finding and modifying emulators for other game platforms.
- Software organization: We need help refactoring the code of this prototype into a form that is easier to reuse. We want embedding quotes into a new webpage feel like using the existing HTML5 `<video>` tag.
- ## Contact
- {rig up contact@quote.games to email joel and adam}


# Curated Quotes

Each should have:
- title: a name for the quoted content, not just the gmae
- file: link to quote .png served from our asset bucket (will be used as the screenshot as well as the playable link)
- comment: explain the quote, referencing what's importantly included/excluded

Because we are showing these in a carousel, we can have a pretty long list, but we want the items to be sorted so that the first 3 or so are sufficient to convey our message(s).

Our primary message: Quotes can enable several compelling use cases -- a new form of human communication.

Our secondary message: There's depth of skill to making a good quote / you have a lot of implicit control over what's included/excluded from the quote.

Meta:
- important to cover use cases (and hint at them in the comment text)
- not important to cover many game types/genres


### Tetris without Tetris

Taste the core gameplay of Tetris. You can clear a few lines at a time, but you can't have the satisfaction of completing a Tetris (clearing 4 lines at once) because that's not included in the quote.

### Alpha Metroid

Tune your technique in the first boss battle of Metroid II. You can beat the boss and refill your supplies, but you can't leave the room.


### (a third example, a significant quote from well-known story)

Supposedly this game has a good plot: https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_Oracle_of_Seasons_and_Oracle_of_Ages#Plot

The quote might store the moment were you take the final action that leads to a significant plot point cut scene.

Other recommendations: https://www.reddit.com/r/Gameboy/comments/785tpl/gameboy_games_with_the_a_great_storynarrative/


### (additional example ideas)

- a quote witnessing correct execution of a test ROM (use case: demonstrating correct implementation of a technical design)
- a quote showing a creative game / tool like a paint program (use case: supporting a meme culture internal to a given game)
- a quote sharing complete playback of interesting music (use case: showing specific game content in context)

# Example Games

Each should have:
- title
- screenshot (served from our assets bucket, a clean 320x288 fat pixel view)
- rom (direct link to gb/gbc)
- comment (including link )
- reference (link to page with more detail)

## Tuff

![Tuff](https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Ftuff-screenshot.png?v=1628103261230)

http://bonsaiden.github.io/Tuff.gb/roms/game.gb

[*Tuff* by BonsaiDen](https://bonsaiden.github.io/Tuff.gb/) is based on a mix of Jump'n'Run and Metroidvania style game elements. We used Tuff extensively during the development of this project. License: MIT.

## µCity

![µCity](https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fucity-screenshot.png?v=1628104547469)


https://github.com/AntonioND/ucity/releases/download/v1.2/ucity.gbc

[*µCity* by AntonioND/SkyLyrac](https://gbhh.avivace.com/game/ucity) is an open-source city-building game for Game Boy Color. License: GPL v3+.

## Soul Void

![]()

https://

[*Soul Void* by Kadabura](https://kadabura.itch.io/soul-void) is a 1-2 hour interactive horror fiction.


