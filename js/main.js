/* global GameBoyCore, StateMachine */

// used by gameboy.js
window.debug = function() {
  //console.log("debug:", ...arguments);
};

const fsm = new StateMachine({
  init: "idle",
  transitions: [
    {
      name: "dropGame",
      from: ["idle", "watching", "riffing", "playing", "recording"],
      to: "playing"
    },
    {
      name: "dropQuote",
      from: ["idle", "watching", "riffing", "playing", "recording"],
      to: "watching"
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
    recordingStatusInterval: null,
    gameboy: null
  },
  methods: {
    onTransition: function(lifecycle, ...args) {
      console.info(
        "transition:",
        lifecycle.transition,
        lifecycle.from,
        "->",
        lifecycle.to,
        args
      );

      if (this.gameboy != null) {
        clearInterval(this.runInterval);
        this.runInterval = null;
        this.gameboy = null;
      }
      
      if (this.gameboy == null && this.currentROM != null) {
        let canvas = document.getElementById("screen");

        this.gameboy = GameBoyCore(canvas, this.currentROM, {});

        this.gameboy.stopEmulator = 1; // required for some reason
        this.gameboy.start();

        if (this.currentState != null) {
          this.currentState[0] = this.currentROM;
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

    onBeforeDropQuote: function(lifecycle, quote) {
      this.currentQuote = quote;
      this.currentROM = fsm.currentQuote.rom;
      this.currentState = fsm.currentQuote.state;
    },

    onEnterWatching: function() {
      console.log("onEnterWatching");
      fsm.button.value = "Take control";

      let iteration = 0;
      this.handleExecuteIteration.apply = function() {
        iteration++;
        return Reflect.apply(...arguments);
        // TODO: check for actions in the log to apply this frame.
      };

      this.handleJoyPadEvent.apply = function() {
        // TODO: ignore events while watching
        Reflect.apply(...arguments);
      };
    },
    
    onLeaveWatching: function() {
      console.log('onLeaveWatching');
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
      this.currentState = this.gameboy.saveState();
    },

    onBeforeDropGame: function(lifecycle, rom) {
      this.currentROM = rom;
      this.currentState = null;
    },

    onEnterPlaying: function() {
      this.button.value = "Record new quote";
    },

    onEnterRecording: function() {
      this.currentTrace = new Trace();
      this.currentTrace.initialState = this.gameboy.saveState();
      this.currentTrace.initialState[0] = this.currentROM;
      this.currentTrace.initialFrameBuffer = this.gameboy.frameBuffer.slice(0);
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

      async function updateRecordingStatus() {
        let percentage = "0.0";
        if (fsm.currentTrace.romDependencies) {
          percentage =
            fsm.currentTrace.romDependencies.size / fsm.currentROM.length;
        }
        document.getElementById("percentRecorded").innerHTML = Number(
          percentage
        ).toLocaleString(undefined, {
          style: "percent",
          minimumFractionDigits: 3
        });
      }

      this.button.value = "Stop recording";
      document.getElementById("recordingStatus").style.display = "block";
      this.recordingStatusInterval = setInterval(updateRecordingStatus, 500);
    },

    onLeaveRecording: function() {
      document.getElementById("recordingStatus").style.display = "none";
      clearInterval(this.recordingStatusInterval);
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
      delete this.handleROM.get;
    },

    onEnterCompiling: async function() {
      console.log(fsm.currentTrace);
      this.button.value = "Compiling...";
      this.button.disabled = true;

      // TODO[jf]: compile the trace using await as needed

      // How many bytes to store per address observed
      const PAGE_SIZE = 64;
      const SAVESTATE_ROM = 0;
      const SAVESTATE_FRAMEBUFFER = 71;

      let zip = new JSZip();
      let maskedROM = new Uint8Array(this.currentROM.length);
      let mask = new Uint8Array(this.currentROM.length);
      let pages = new Set();
      for (let address of this.currentTrace.romDependencies) {
        pages.add(Math.floor(address / PAGE_SIZE));
      }
      for (let page of pages) {
        let startAddress = page * PAGE_SIZE;
        for (let i = 0; i < PAGE_SIZE; i++) {
          let address = startAddress + i;
          maskedROM[address] = this.currentROM[address];
          mask[address] = 1;
        }
      }

      for (let i = 0; i < 0x134; i++) {
        maskedROM[i] = 0;
        mask[i] = 0;
      }
      for (let i = 0x134; i < 0x14d; i++) {
        maskedROM[i] = this.currentROM[i];
        mask[i] = 1;
      }

      let state = this.currentTrace.initialState;
      state[SAVESTATE_ROM] = null;
      state[SAVESTATE_FRAMEBUFFER] = null;

      zip.file("rom", maskedROM);
      zip.file("rom_mask", mask);
      zip.file("savestate", msgpack.serialize(state));
      if (this.currentTrace.actions) {
        zip.file("action_log", msgpack.serialize(this.currentTrace.actions));
      }

      let binary = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
      });

      let rgba = [];
      for (let pixel of this.currentTrace.initialFrameBuffer) {
        rgba.push((pixel & 0xff0000) >> 16);
        rgba.push((pixel & 0x00ff00) >> 8);
        rgba.push((pixel & 0x0000ff) >> 0);
        rgba.push(0xff);
      }

      let png = new PNGBaker(UPNG.encode([rgba], 160, 144, 0));
      png.chunk = binary;
      let img = document.createElement("img");
      let blobUrl = URL.createObjectURL(png.toBlob());
      img.src = blobUrl;

      document.getElementById("quotes").appendChild(img);
      //[jf] END

      setTimeout(function() {
        fsm.complete();
      }, 500);
    },

    onLeaveCompiling: function() {
      this.button.disabled = false;
      // at the end of recording, take them back to where recording started so that it is easy to record another take
      //[jf] commented out, for now, since I can't get this working
      // this.gameboy.returnFromState(this.currentTrace.initialState);
      this.currentTrace = null;
    },

    onEnterRiffing: function() {
      console.log('onEnterRiffing');
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
      this.currentState = null;
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
  initialFrameBuffer;
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

  document.getElementById("container").ondragover = ev => ev.preventDefault();
  document.getElementById("container").ondrop = dropHandler;

  //await dropExampleGame();
  await dropExampleQuote();
})();

async function dropExampleGame() {
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  fsm.dropGame(new Uint8Array(buffer));
}

async function dropExampleQuote() {
  let resource =
    "https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fjeff.png";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let quote = await loadQuote(buffer);
  fsm.dropQuote(quote);
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

async function processFile(file) {
  console.log("processing file");
  let buffer = await file.arrayBuffer();
  let dataView = new DataView(buffer);
  // FIXME: Look for the chunk name instead
  let isPNG = dataView.getUint32(0) == 0x89504e47;
  // https://github.com/file/file/blob/905ca555b0e2bdcf9d2985bcc7c1c22e2229b088/magic/Magdir/console#L114
  let isGB =
    dataView.getUint32(0x104) == 0xceed6666 &&
    dataView.getUint32(0x108) == 0xcc0d000b;

  if (isPNG) {
    console.log("it's a PNG");
    fsm.dropQuote(await loadQuote(buffer));
  } else if (isGB) {
    console.log("it's a ROM");
    fsm.dropGame(new Uint8Array(buffer));
  } else {
    alert("Unsupported file");
  }
}
