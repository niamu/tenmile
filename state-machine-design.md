State machine

States:
- idle (nothing on screen)
- watching (a quote loop)
- riffing (on a quote)
- recording (a quote)
- playing (a full game)
- compiling (a quote)

Transitions:


- idle,dropQuote,watching
- idle,dropGame,playing

- watching,dropQuote,watching
- watching,dropGame,playing (continue if compatible)
- watching,tap,riffing
- watching,oob,watching (can't happen?)

- riffing,dropQuote,watching
- riffing,dropGame,playing (continue if compatible)
- riffing,tap,watching
- riffing,oob,riffing

- playing,dropQuote,watching
- playing,dropGame,playing (fresh)
- playing,tap,recording

- recording,dropQuote,watching
- recording,dropGame,playing (fresh)
- recording,tap,compiling
- recording,safety,compiling

- compiling,complete,playing (at *start* of recording for another take)




idle: trigger load game or quote based on hash fragment

Global state:
- fsm
- currentGame (ROM)
- currentQuote (obj)
- currentTrace (obj)

class Quote:
- rom (with many zeros)
- romMask (like rom but zero/one)
- savestate (reconstituted)
- actions (actions by iteration)
- cursor (int index into trace)

class Trace
- frameBuffer (at start)
- savestate (at start)
- actions
- romDependencies (Set of int)

~
Safety/convenience:
- trigger if > 10% rom needed (estimated); will tend to end recording at expensive transitioning if you forget