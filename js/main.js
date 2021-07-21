/* global GameBoyCore, XAudioServer, StateMachine */
/* global loadQuote, compileQuote, Quote, Trace */

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
    canvas: document.getElementById("screen"),
    button: document.getElementById("button"),
    status: document.getElementById("status"),
    currentROM: null,
    currentQuote: null,
    currentTrace: null,
    lastState: null,
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
        lifecycle.to
        //...args
      );
      
      this.canvas.classList.remove(lifecycle.from);
      this.canvas.classList.add(lifecycle.to);

      if (
        this.gameboy != null &&
        !identicalArrays(this.gameboy.unproxiedROM, this.currentROM)
      ) {
        // need to rebuild for new ROM
        console.log('rebuilding gameboy');
        clearInterval(this.runInterval);
        this.runInterval = null;
        this.gameboy = null;
      }

      const opts = {
        sound: XAudioServer
      };

      if (this.gameboy == null && this.currentROM != null) {
        this.gameboy = GameBoyCore(this.canvas, this.currentROM, opts);
        
        this.gameboy.stopEmulator = 1; // required for some reason
        this.gameboy.start();
        
        const EMULATOR_LOOP_INTERVAL = 8;
        this.runInterval = setInterval(function() {
          fsm.gameboy.run();
        }, EMULATOR_LOOP_INTERVAL);
        
        this.gameboy.unproxiedROM = this.gameboy.ROM;
        this.gameboy.unproxiedJoyPadEvent = this.gameboy.JoyPadEvent;

        this.gameboy.JoyPadEvent = new Proxy(
          this.gameboy.JoyPadEvent,
          this.handleJoyPadEvent
        );

        this.gameboy.executeIteration = new Proxy(
          this.gameboy.executeIteration,
          this.handleExecuteIteration
        );

        this.gameboy.ROM = new Proxy(this.gameboy.ROM, this.handleROM);
        
        this.gameboy.resume = (state) => {
          this.gameboy.returnFromState(state);
          this.gameboy.ROM = new Proxy(this.gameboy.ROM, this.handleROM);
        };
        
      }

      if (this.gameboy) {
        document.title = lifecycle.to + " " + this.gameboy.name;
      }
    },

    onBeforeDropQuote: function(lifecycle, quote) {
      this.currentQuote = quote;
      this.currentROM = fsm.currentQuote.rom;
      this.lastState = fsm.currentQuote.state;
    },

    onEnterWatching: function() {
      this.button.value = "Take control";

      this.gameboy.resume(this.currentQuote.state);

      let iteration = 0;
      this.handleExecuteIteration.apply = function() {
        
        if(iteration >= fsm.currentQuote.actions.length) {
          fsm.gameboy.resume(fsm.currentQuote.state);
          iteration = 0;
        } else {
          for(let action of fsm.currentQuote.actions[iteration]) {
            fsm.gameboy.unproxiedJoyPadEvent(...action);
          }
          iteration++;
        }
        
        return Reflect.apply(...arguments);
      };

      this.handleJoyPadEvent.apply = function() {
        // ignore events while watching, but count it as trying to grab control
        fsm.tap();
      };
    },

    onLeaveWatching: function() {
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
      this.lastState = this.gameboy.saveState();
      this.lastState[0] = this.currentROM;
    },

    onBeforeDropGame: function(lifecycle, rom) {
      if (this.currentQuote) {
        // Trying to insert ROM to continue?
        let match = true;
        for (let i = 0; i < rom.length; i++) {
          if (
            this.currentQuote.romMask[i] == 1 &&
            this.currentROM[i] != rom[i]
          ) {
            match = false;
          }
        }
        if (match) {
          // Continuing unbounded play!
          this.currentQuote = null;
          this.currentROM = rom;
          this.lastState[0] = rom; // patch last state for continued play
          return;
        }
      }
      this.currentROM = rom;
      this.lastState = null;
    },

    onEnterPlaying: function() {
      if (this.lastState) {
        this.gameboy.resume(this.lastState);
      }
      this.button.value = "Record new quote";
    },

    onLeavePlaying: function() {
      this.lastState = this.gameboy.saveState();
      this.lastState[0] = this.currentROM;
    },

    onEnterRecording: function() {
      this.gameboy.resume(this.lastState);

      this.currentTrace = new Trace();
      this.currentTrace.initialState = this.gameboy.saveState();
      this.currentTrace.initialState[0] = this.currentROM;
      this.currentTrace.initialFrameBuffer = this.gameboy.frameBuffer.slice(0);
      this.currentTrace.actions = [];
      this.currentTrace.romDependencies = new Set();

      let actionsSinceLastIteration = [];
      this.handleExecuteIteration.apply = function() {
        fsm.currentTrace.actions.push(actionsSinceLastIteration);
        actionsSinceLastIteration = [];
        return Reflect.apply(...arguments);
      };

      this.handleJoyPadEvent.apply = function(target, thisArg, args) {
        actionsSinceLastIteration.push(args);
        return Reflect.apply(...arguments);
      };

      this.handleROM.get = function(target, prop) {
        fsm.currentTrace.romDependencies.add(prop);
        return target[prop];
      };

      function updateRecordingStatus() {
        let percentage =
          fsm.currentTrace.romDependencies.size / fsm.currentROM.length;
        fsm.status.innerText =
          Number(percentage).toLocaleString(undefined, {
            style: "percent",
            minimumFractionDigits: 2
          }) + " of ROM bytes accessed.";
      }

      this.button.value = "Stop recording";
      this.recordingStatusInterval = setInterval(updateRecordingStatus, 500);
    },

    onLeaveRecording: function() {
      this.status.innerText = "";
      clearInterval(this.recordingStatusInterval);
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
      delete this.handleROM.get;
    },

    onEnterCompiling: function() {
      this.button.value = "Compiling...";
      this.button.disabled = true;
      compileQuote(this.currentTrace).then(() => fsm.complete());
    },

    onLeaveCompiling: function() {
      this.button.disabled = false;
      this.currentTrace = null;
    },

    onEnterRiffing: function() {
      this.button.value = "Watch pre-recorded play";

      let oob = false;

      this.handleROM.get = function(target, prop) {
        if (fsm.currentQuote.romMask[prop] == 0) {
          oob = true;
        }
        return target[prop];
      };

      this.handleExecuteIteration.apply = function() {
        Reflect.apply(...arguments);
        if (oob) {
          console.log("Resetting after OOB.");
          oob = false;
          fsm.gameboy.resume(fsm.currentQuote.state);
        }
      };
    },

    onLeaveRiffing: function() {
      delete this.handleROM.get;
      delete this.handleExecuteIteration.apply;
      this.lastState = this.gameboy.saveState();
      this.lastState[0] = this.currentROM;
    }
  }
});

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

function identicalArrays(a,b) {
  for(let i in a) {
    if(a[i] != b[i]) {
      return false;
    } 
  }
  return a.length == b.length;
}

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
  document.getElementById("container").ondrop = ev => {
    ev.preventDefault();
    for (let item of ev.dataTransfer.files) {
      processFile(item);
    }
  };

  let buttonToKey = {}
  Object.keys(keyToButton).forEach((key) => {buttonToKey[keyToButton[key]] = key})
  
  const controls = "A/B/Start/Select with " + [buttonToKey["a"],buttonToKey["b"],buttonToKey["start"],buttonToKey["select"]].join("/")
  document.getElementById("controls").textContent = controls;
  
  await dropExampleGame();
  //await dropExampleQuote();
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

async function processFile(file) {
  let buffer = await file.arrayBuffer();
  let dataView = new DataView(buffer);
  let isPNG = dataView.getUint32(0) == 0x89504e47;
  let isGB =
    dataView.getUint32(0x104) == 0xceed6666 &&
    dataView.getUint32(0x108) == 0xcc0d000b;

  if (isPNG) {
    fsm.dropQuote(await loadQuote(buffer));
  } else if (isGB) {
    fsm.dropGame(new Uint8Array(buffer));
  } else {
    alert("Unsupported file");
  }
}
