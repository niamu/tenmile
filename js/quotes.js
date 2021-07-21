/* global GameBoyCore, StateMachine */

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
    currentROM: null,
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
      console.log(
        "transition:",
        lifecycle.transition,
        lifecycle.to,
        lifecycle.from
      );

      if (this.gameboy != null) {
        this.currentState = this.gameboy.saveState();
        this.currentState[0] = this.currentROM; // unproxied ROM
        this.gameboy = null;
        clearInterval(this.runInterval);
        this.runInterval = null;
      }

      if (this.currentROM != null) {
        let canvas = document.getElementById("screen");

        this.gameboy = GameBoyCore(canvas, this.currentROM, {});

        this.gameboy.stopEmulator = 1; // required for some reason
        this.gameboy.start();

        if (this.currentState != null) {
          this.gameboy.returnFromState(this.currentState);
        }

        const EMULATOR_LOOP_INTERVAL = 8;
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
      this.currentTrace.initialState[0] = this.currentROM;
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
        fsm.gameboy.returnFromState(fsm.currentTrace.initialState);
        fsm.complete();
      }, 500);
    },

    onLeaveCompiling: function() {
      fsm.currentTrace = null;
      this.button.disabled = false;
    },

    onEnterWatching: function() {
      this.button.value = "Take control";

      fsm.gameboy.returnFromState(fsm.currentQuote.state);

      let iteration = 0;
      this.handleExecuteIteration.apply = function() {
        iteration++;
        return Reflect.apply(...arguments);
        // TODO: check for actions in the log to apply this frame.
      };

      this.handleJoyPadEvent.apply = function() {
        // ignore event while watching
      };
    },

    onLeaveWatching: function() {
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
    },

    onEnterRiffing: function() {
      this.button.value = "Watch pre-recorded play";

      let oob = false;

      this.handleROM.get = function(target, prop) {
        if (fsm.currentQuote.romMask[prop] == 0) {
          //console.log("OOB access:", prop);
          oob = true;
        }
        return target[prop];
      };

      this.handleExecuteIteration.apply = function() {
        Reflect.apply(...arguments);
        if (oob) {
          console.log("Resetting after OOB.");
          oob = false;
          fsm.gameboy.returnFromState(fsm.currentQuote.state);
          fsm.gameboy.ROM = new Proxy(fsm.gameboy.ROM, fsm.handleROM);
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
}

class Trace {
  initialState;
  actions;
  romDependencies;
}

async function loadQuote(buffer) {
    let quote = new Quote();

    let png = new PNGBaker(buffer);
    let fileArrays = {};
    let jszip = new JSZip();
    let zip = await jszip.loadAsync(png.chunk);
    for (let filename of Object.keys(zip.files)) {
      fileArrays[filename] = await zip.file(filename).async("uint8array");
    }

    let frameBuffer = new Int32Array(160 * 144);
    let rgba = UPNG.toRGBA8(UPNG.decode(buffer))[0];
    for (let i = 0; i < frameBuffer.length; i++) {
      frameBuffer[i] += rgba[4 * i + 0] << 16;
      frameBuffer[i] += rgba[4 * i + 1] << 8;
      frameBuffer[i] += rgba[4 * i + 2] << 0;
    }

    quote.rom = fileArrays.rom;
    quote.romMask = fileArrays.rom_mask;

    if (fileArrays.action_log) {
      quote.actions = msgpack.deserialize(fileArrays.action_log);
    }
    let state = msgpack.deserialize(fileArrays.savestate);

    const SAVESTATE_ROM = 0;
    const SAVESTATE_FRAMEBUFFER = 71;

    state[SAVESTATE_ROM] = fileArrays.rom;
    state[SAVESTATE_FRAMEBUFFER] = frameBuffer;

    quote.state = state;

    return quote;
  }

async function compileQuote(trace) {
  // TODO
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

  //await dropExampleGame();
  await dropExampleQuote();
})();

async function dropExampleGame() {
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let rom = new Uint8Array(buffer);
  fsm.currentROM = rom;
  fsm.currentState = null;
  fsm.dropGame();
}

async function dropExampleQuote() {
  let resource =
    "https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fjeff.png";
  let buffer = await (await fetch(resource)).arrayBuffer();
  fsm.currentQuote = await loadQuote(buffer);
  console.log(fsm.currentQuote);
  fsm.currentROM = fsm.currentQuote.rom; // ROM was embedded in the save
  fsm.currentState = fsm.currentQuote.state;
  fsm.dropQuote();
}

// https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop
function dropHandler(ev) {
  console.log("File(s) dropped");

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();

  if (ev.dataTransfer.items) {
    // Use DataTransferItemList interface to access the file(s)
    for (var i = 0; i < ev.dataTransfer.items.length; i++) {
      // If dropped items aren't files, reject them
      if (ev.dataTransfer.items[i].kind === "file") {
        processFile(ev.dataTransfer.items[i].getAsFile());
      }
    }
  } else {
    // Use DataTransfer interface to access the file(s)
    for (var i = 0; i < ev.dataTransfer.files.length; i++) {
      processFile(ev.dataTransfer.files[i]);
    }
  }
}

function dragOverHandler(ev) {
  console.log("File(s) in drop zone");

  // Prevent default behavior (Prevent file from being opened)
  ev.preventDefault();
}

async function processFile(file) {
  /*
  if (fsm.is("playingROM") || fsm.is("playingQuote")) {
    fsm.quit();
  }
  */

  let buffer = await file.arrayBuffer();
  // FIXME: Look for the chunk name instead
  let isPNG = new Uint32Array(buffer.slice(0, 4))[0] == 0x474e5089;
  // https://github.com/file/file/blob/905ca555b0e2bdcf9d2985bcc7c1c22e2229b088/magic/Magdir/console#L114
  let isGB =
    new Uint32Array(buffer.slice(0x104, 0x10c))[0] == 0x6666edce &&
    new Uint32Array(buffer.slice(0x104, 0x10c))[1] == 0x0b000dcc;

  if (isPNG) {
    //fsm.runQuote(buffer);
    fsm.currentROM = fsm.currentQuote.rom; // ROM was embedded in the save
    fsm.currentState = fsm.currentQuote.state;
    fsm.dropQuote();
  } else if (isGB) {
    let rom = new Uint8Array(buffer);
    fsm.currentROM = rom;
    fsm.currentState = null;
    fsm.dropGame();
  } else {
    alert("Unsupported file");
  }
}