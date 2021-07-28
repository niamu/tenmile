"use strict";
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
      from: ["idle", "watching", "riffing", "playing"],
      to: "playing"
    },
    {
      name: "dropQuote",
      from: ["idle", "watching", "riffing", "playing"],
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
    sound: document.getElementById("sound"),
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
    updateVolume: function() {
      if (this.gameboy) {
        this.gameboy.opts.volume = this.sound.checked ? 1 : 0;
        this.gameboy.changeVolume();
      }
    },
    saveState: function() {
      let state = Array.from(this.gameboy.saveState());
      state[0] = this.gameboy._unproxiedROM;
      state[207] = this.gameboy.CPUCyclesTotalCurrent;
      state[208] = this.gameboy.JoyPad;
      return state;
    },
    restoreState: function(state) {
      this.gameboy.returnFromState(state);
      this.gameboy.CPUCyclesTotalCurrent = state[207];
      this.gameboy.JoyPad = state[208];
      this.gameboy.ROM = new Proxy(this.gameboy.ROM, this.handleROM);
    },
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
        this.gameboy._unproxiedROM != this.currentROM
      ) {
        // need to rebuild for new ROM
        console.log("rebuilding gameboy");
        clearInterval(this.runInterval);
        this.runInterval = null;
        this.gameboy = null;
      }

      const opts = { sound: XAudioServer };

      if (this.gameboy == null && this.currentROM != null) {
        this.gameboy = GameBoyCore(this.canvas, this.currentROM, opts);

        this.gameboy.opts.volume = this.sound.checked ? 1 : 0;

        this.gameboy.stopEmulator = 1; // required for some reason
        this.gameboy.start();

        const EMULATOR_LOOP_INTERVAL = 8;
        this.runInterval = setInterval(function() {
          try {
            fsm.gameboy.run();
          } catch (exception) {
            console.warn("Exception during gameboy.run():", exception);
          }
        }, EMULATOR_LOOP_INTERVAL);

        this.gameboy._unproxiedROM = this.gameboy.ROM;
        this.gameboy._unproxiedJoyPadEvent = this.gameboy.JoyPadEvent;

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

      this.restoreState(this.currentQuote.state);

      let oob = false;

      this.handleROM.get = function(target, prop) {
        if (fsm.currentQuote.romMask[prop] != 1) {
          oob = true;
        }
        return target[prop];
      };

      let iteration = 0;
      this.handleExecuteIteration.apply = function() {
        if (iteration >= fsm.currentQuote.actions.length) {
          console.log("Resetting after end of recorded actions.");
          fsm.restoreState(fsm.currentQuote.state);
          iteration = 0;
        } else {
          for (let action of fsm.currentQuote.actions[iteration]) {
            fsm.gameboy._unproxiedJoyPadEvent(...action);
          }
          iteration++;
        }

        Reflect.apply(...arguments);
        if (oob) {
          console.warn("Resetting after OOB while *watching*.");
          oob = false;
          fsm.restoreState(fsm.currentQuote.state);
        }
      };

      this.handleJoyPadEvent.apply = function() {
        // Don't apply event but instead interpret input as trying to grab control
        fsm.tap();
      };
    },

    onLeaveWatching: function() {
      delete this.handleExecuteIteration.apply;
      delete this.handleJoyPadEvent.apply;
      delete this.handleROM.get;
      this.lastState = this.saveState(); // current state might be used to start riffing at this specific moment
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
        this.restoreState(this.lastState);
      }
      this.button.value = "Record new quote";
    },

    onLeavePlaying: function() {
      this.lastState = this.saveState(); // state might be used to begin recording
    },

    onEnterRecording: function() {
      this.restoreState(this.lastState);

      this.currentTrace = new Trace();
      this.currentTrace.initialState = this.saveState();
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
      this.restoreState(this.lastState);

      let oob = false;

      this.handleROM.get = function(target, prop) {
        if (fsm.currentQuote.romMask[prop] != 1) {
          oob = true;
        }
        return target[prop];
      };

      this.handleExecuteIteration.apply = function() {
        Reflect.apply(...arguments);
        if (oob) {
          console.log("Resetting after OOB.");
          oob = false;
          fsm.restoreState(fsm.currentQuote.state);
        }
      };
    },

    onLeaveRiffing: function() {
      delete this.handleROM.get;
      delete this.handleExecuteIteration.apply;
      this.lastState = this.saveState(); // current state might be used to continue play unlocked with full ROM
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

function identicalArrays(a, b) {
  if (a.length != b.length) {
    return false;
  } else {
    for (let i in a) {
      if (a[i] != b[i]) {
        return false;
      }
    }
    return true;
  }
}

(async function onPageLoad() {
  // keydown and keyup are what we use to get key events into the Game Boy
  document.addEventListener("keydown", handleKey, false);
  document.addEventListener("keyup", handleKey, false);
  // The Button is a multi-use button that has different uses depending on the state of the emulator
  document.getElementById("button").onclick = () => fsm.can("tap") && fsm.tap();

  // enable drag & drop operations onto the emulator
  document.getElementById("container").ondragover = ev => ev.preventDefault();
  document.getElementById("container").ondrop = ev => {
    ev.preventDefault();
    for (let item of ev.dataTransfer.files) {
      processFile(item);
    }
  };

  document.getElementById("sound").onchange = checkbox => {
    fsm.updateVolume();
  };

  // print out the buttons based on the value of the buttonToKey mapping
  let buttonToKey = {};
  Object.keys(keyToButton).forEach(key => {
    buttonToKey[keyToButton[key]] = key;
  });

  const controls =
    "A/B/Start/Select with " +
    [
      buttonToKey["a"],
      buttonToKey["b"],
      buttonToKey["start"],
      buttonToKey["select"]
    ].join("/");
  document.getElementById("controls").textContent = controls;

  let buttons = document.querySelectorAll(".button");
  let buttonsArray = Array.prototype.slice.call(buttons);
  buttonsArray.forEach(function(element) {
    element.addEventListener("touchstart", handleTouch);
    element.addEventListener("touchend", handleTouch);
    element.addEventListener("touchcancel", handleTouch);
  });
  let dPad = document.getElementById("d-pad");
  const dPadRect = dPad.getBoundingClientRect();
  function dPadClosure(event) {
    handleDPad(event, dPadRect);
  }
  dPad.addEventListener("touchstart", dPadClosure);
  //dPad.addEventListener("touchmove", dPadClosure);
  dPad.addEventListener("touchend", dPadClosure);
  dPad.addEventListener("touchcancel", dPadClosure);
})();

function handleKey(event) {
  if (fsm.gameboy) {
    let key = event.key;
    if (key in keyToButton) {
      let keycode = buttonToKeycode[keyToButton[key]];
      fsm.gameboy.JoyPadEvent(keycode, event.type == "keydown");
      try {
        event.preventDefault();
      } catch (error) {
        console.log("handleKey", error);
      }
    }
  }
}

function handleDPad(event, rect) {
  event.preventDefault();
  let buttonDown = event.type == "touchstart" ? true : false;
  for (var i = 0; i < event.changedTouches.length; i++) {
    let touch = event.changedTouches[i];
    console.log(event.type);
    let x = touch.clientX - rect.left;
    let y = touch.clientY - rect.top;
    let a = y / x < 1.0 ? true : false;
    let b = x / (rect.height - y) < 1.0 ? true : false;
    let direction = "";
    if (a == b) {
      direction = a ? "up" : "down";
    } else {
      direction = a ? "right" : "left";
    }
    console.log("D-Pad:", direction);
    let keycode = buttonToKeycode[direction];
    fsm.gameboy.JoyPadEvent(keycode, buttonDown);
  }
}

function handleTouch(event) {
  let div = event.target;
  let buttonName = div.id.split("-")[1];
  let buttonDown = event.type == "touchstart" ? true : false;
  if (buttonDown) {
    div.classList.remove("up");
    div.classList.add("down");
  } else {
    div.classList.remove("down");
    div.classList.add("up");
  }

  try {
    event.preventDefault();
  } catch (error) {
    console.log("handleTouch", error);
  }

  if (fsm.gameboy) {
    let keycode = buttonToKeycode[buttonName];
    fsm.gameboy.JoyPadEvent(keycode, buttonDown);
  }
}

async function dropGameByUrl(url) {
  let buffer = await (await fetch(url)).arrayBuffer();
  fsm.dropGame(new Uint8Array(buffer));
}

async function dropQuoteByUrl(url) {
  let buffer = await (await fetch(url)).arrayBuffer();
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
