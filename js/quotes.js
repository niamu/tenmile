/* global GameBoyCore, StateMachine */

const EMULATOR_LOOP_INTERVAL = 8;

const keyToButton = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
  x: "a",
  z: "b",
  Shift: "select",
  Enter: "start"
};

const buttonToKeycode = {
  right: 0,
  left: 1,
  up: 2,
  down: 3,
  a: 4,
  b: 5,
  select: 6,
  start: 7
};

window.debug = function() {
  console.log("debug:", ...arguments);
};

const fsm = new StateMachine({
  init: "idle",
  transitions: [
    {
      name: "dropQuote",
      from: ["idle", "watching", "riffing", "playing", "recording"],
      to: "watching"
    },
    {
      name: "dropGame",
      from: ["idle", "watching", "riffing", "playing", "recording"],
      to: "playing"
    },

    { name: "tap", from: "watching", to: "riffing" },
    { name: "tap", from: "riffing", to: "watching" },
    { name: "tap", from: "playing", to: "recording" },
    { name: "tap", from: "recording", to: "compiling" },

    { name: "complete", from: "compiling", to: "playing" }
  ],
  data: {
    button: document.getElementById("button"),
    currentGame: null,
    currentQuote: null,
    currentTrace: null,
    handleJoyPadEvent: {},
    handleExecuteIteration: {},
    handleROM: {},
    runInterval: null,
    gameboy: null
  },
  methods: {
    onEnterPlaying: function() {
      let canvas = document.getElementById("screen");
      this.gameboy = GameBoyCore(canvas, this.currentGame, {
        drawEvents: true
      });

      this.gameboy.stopEmulator = 1; // required for some reason
      this.gameboy.start();

      this.gameboy.JoyPadEvent = new Proxy(
        this.gameboy.JoyPadEvent,
        this.handleJoyPadEvent
      );

      this.gameboy.executeIteration = new Proxy(
        this.gameboy.executeIteration,
        this.handleExecuteIteration
      );

      this.gameboy.ROM = new Proxy(this.gameboy.ROM, this.handleROM);

      this.button.value = "Record new quote";

      this.runInterval = setInterval(function() {
        fsm.gameboy.run();
      }, EMULATOR_LOOP_INTERVAL);
    },

    onEnterRecording: function() {
      this.currentTrace = new Trace();
      this.currentTrace.initialSaveState = this.gameboy.saveState();
      this.currentTrace.actions = [];
      this.currentTrace.romDependencies = new Set();

      let iteration = 0;
      this.handleExecuteIteration.apply = function() {
        iteration++;
        return Reflect.apply(...arguments);
      };

      this.handleJoyPadEvent.apply = function(target, thisArg, args) {
        fsm.currentTrace.actions.push({ on: iteration, do: args });
        return Reflect.apply(...arguments);
      };
      
      this.handleROM.get = function(target, prop) {
        fsm.currentTrace.romDependencies.add(prop);
        return target[prop];
      };

      this.button.value = "Stop recording";
    },

    onLeaveRecording: function() {
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
      delete this.handleROM.get;
    },

    onEnterCompiling: function() {
      console.log(fsm.currentTrace);
      this.button.value = "Compiling...";
      this.button.disabled = true;
    }
  }
});

class Quote {
  rom;
  romMask;
  savestate;
  actions;
  actionCursor;
}

class Trace {
  initialSaveState;
  actions;
  romDependencies;
}

/*

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

*/

loadGB();

async function loadGB() {
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let rom = new Uint8Array(buffer);

  fsm.currentGame = rom;
  fsm.dropGame();

  function handleKey(event) {
    let down = event.type == "keydown";
    let key = event.key;
    if (key in keyToButton) {
      let keycode = buttonToKeycode[keyToButton[key]];
      fsm.gameboy.JoyPadEvent(keycode, down);
      console.log(keycode + " " + down);
    }
  }
  document.addEventListener("keydown", handleKey, false);
  document.addEventListener("keyup", handleKey, false);

  document.getElementById("button").onclick = () => fsm.tap();
}
