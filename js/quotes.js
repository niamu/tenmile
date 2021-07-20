/* global GameBoyCore, StateMachine */

const EMULATOR_LOOP_INTERVAL = 8;

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
    currentState: null,
    handleJoyPadEvent: {},
    handleExecuteIteration: {},
    handleROM: {},
    runInterval: null,
    gameboy: null
  },
  methods: {
    onBeforeTransition: function(lifecycle) {
      if (this.gameboy != null) {
        this.currentState = this.gameboy.saveState();
        this.currentState[0] = this.currentGame; // unproxied ROM
        this.gameboy = null;
        cancelInterval(this.runInterval);
        this.runInterval = null;
      }

      if (this.currentGame != null) {
        let canvas = document.getElementById("screen");

        this.gameboy = GameBoyCore(canvas, this.currentGame, {
          drawEvents: true
        });

        this.gameboy.stopEmulator = 1; // required for some reason
        this.gameboy.start();

        if (this.currentState != null) {
          this.gameboy.returnFromState(this.currentState);
        }

        this.runInterval = setInterval(function() {
          fsm.gameboy.run();
        }, EMULATOR_LOOP_INTERVAL);

        if (this.currentState != null) {
          this.gameboy.returnFromState(this.currentState);
        }

        this.gameboy.JoyPadEvent = new Proxy(
          this.gameboy.JoyPadEvent,
          this.handleJoyPadEvent
        );

        this.gameboy.executeIteration = new Proxy(
          this.gameboy.executeIteration,
          this.handleExecuteIteration
        );

        this.gameboy.ROM = new Proxy(this.gameboy.ROM, this.handleROM);
      }
    },

    onEnterPlaying: function() {
      this.button.value = "Record new quote";
    },

    onEnterRecording: function() {
      this.currentTrace = new Trace();
      this.currentTrace.initialState = this.gameboy.saveState();
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

    onEnterCompiling: async function() {
      console.log(fsm.currentTrace);
      this.button.value = "Compiling...";
      this.button.disabled = true;

      // TODO[jf]: compile the trace using await as needed
      setTimeout(() => {
        // at the end of recording, take them back to where recording started so that it is easy to record another take
        fsm.currentState = fsm.currentTrace.initialState;
        fsm.currentState[0] = fsm.currentGame; // unproxied ROM
        fsm.complete();
      }, 500);
    },

    onLeaveCompiling: function() {
      fsm.currentTrace = null;
      this.button.disabled = false;
    },

    onBeginWatching: function() {
      this.gameboy.returnFromState(this.currentQuote.state);

      // TODO: start playing action animation
      
      let iteration = 0;
      this.handleExecuteIteration.apply = function() {
        iteration++;
        return Reflect.apply(...arguments);
        // TODO: check for actions in the log to apply this frame.
      };
    },
    
    onLeaveWatching: function() {
      delete this.handleExecuteIteration.apply;
    },

    onBeginRiffing: function() {
    
      let oob = false;
      
      this.handleROM.get = function(target, prop) {
        if (fsm.currentQuote.romMask[prop] == 0) {
          console.log('OOB access to ROM address:', prop);
          oob = true;
        }
        return target[prop];
      };
      
      this.handleExecuteIteration.apply = function() {
        if(oob) {
          console.log('Resetting after OOB.');
          fsm.gameboy.returnFromState(fsm.currentQuote.state);
        } else {
          Reflect.apply(...arguments);
        }
      };
      
    },

    onLeaveRiffing: function() {
      delete this.handleROM.get;
      delete this.handleExecuteIteration.apply;
    }
  }
});

class Quote {
  rom;
  romMask;
  state;
  actions;
  actionCursor;

  static async loadFromArrayBuffer(buffer) {
    let png = new PNGBaker(buffer);
    let part = {};
    let jszip = new JSZip();
    let zip = await jszip.loadAsync(png.chunk);
    for (let filename of Object.keys(zip.files)) {
      part[filename] = await zip.file(filename).async("uint8array");
    }

    let frameBuffer = new Int32Array(160 * 144);
    let rgba = UPNG.toRGBA8(UPNG.decode(buffer))[0];
    for (let i = 0; i < frameBuffer.length; i++) {
      frameBuffer[i] += rgba[4 * i + 0] << 16;
      frameBuffer[i] += rgba[4 * i + 1] << 8;
      frameBuffer[i] += rgba[4 * i + 2] << 0;
    }
    part.frameBuffer = frameBuffer;

    this.rom = part.rom;
    this.romMask = part.rom_mask;
    if(part.action_log) {
      this.actions = msgpack.deserialize(part.action_log);
    }
    state = msgpack.deserialize(part.savestate);
    state[SAVESTATE_ROM] = rom;
    state[SAVESTATE_FRAMEBUFFER] = part.frameBuffer;
    this.state = state;
  }
}

class Trace {
  initialState;
  actions;
  romDependencies;

  compileQuoteToArrayBuffer() {
    // TODO
  }
}

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

(async function onPageLoad() {
  function handleKey(event) {
    if (fsm.gameboy) {
      let key = event.key;
      if (key in keyToButton) {
        let keycode = buttonToKeycode[keyToButton[key]];
        fsm.gameboy.JoyPadEvent(keycode, event.type == "keydown");
      }
    }
  }
  document.addEventListener("keydown", handleKey, false);
  document.addEventListener("keyup", handleKey, false);

  document.getElementById("button").onclick = () => fsm.tap();

  /*
  // simulate the example game being dropped when the page loads
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let rom = new Uint8Array(buffer);
  fsm.currentGame = rom;
  fsm.currentState = null;
  fsm.dropGame();*/

  // simulate the example game being dropped when the page loads
  let resource =
    "hhttps://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fjeff.png";
  let buffer = await (await fetch(resource)).arrayBuffer();
  fsm.currentState = await Quote.loadFromArrayBuffer(buffer);
  fsm.currentGame = fsm.currentState[0]; // ROM was embedded in the save
  fsm.dropQuote();

  // https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fjeff.png
})();
