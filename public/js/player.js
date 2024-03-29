"use strict";
/* global GameBoyCore, XAudioServer, StateMachine, msgpack */
import {
  loadQuote,
  compileQuote,
  Quote,
  Trace,
  SLICED_MEMORIES,
} from "./quotes.js";
/* global gtag */

// used by gameboy.js
window.debug = function () {
  //console.log("debug:", ...arguments);
};

let dpadDirection = null;

const fsm = window.fsm = new StateMachine({
  init: "idle",
  transitions: [
    {
      name: "dropGame",
      from: ["idle", "watching", "riffing", "playing"],
      to: "playing",
    },
    {
      name: "dropQuote",
      from: ["idle", "watching", "riffing", "playing"],
      to: "watching",
    },
    { name: "tap", from: "watching", to: "riffing" },
    { name: "tap", from: "riffing", to: "watching" },
    { name: "tap", from: "playing", to: "recording" },
    { name: "tap", from: "recording", to: "compiling" },
    { name: "complete", from: "compiling", to: "playing" },
  ],
  data: {
    canvas: document.getElementById("screen"),
    button: document.getElementById("button"),
    status: document.getElementById("status"),
    sound: document.getElementById("sound"),
    currentROM: null,
    currentQuote: null,
    currentTrace: null,
    onJoyPadEvent: null,
    onRun: null,
    onMemoryAccess: null,
    runInterval: null,
    recordingStatusInterval: null,
    gameboy: null,
  },
  methods: {
    updateVolume: function () {
      if (this.gameboy) {
        this.gameboy.opts.volume = this.sound.checked ? 1 : 0;
        this.gameboy.changeVolume();
      }
    },
    saveState: function () {
      let state = Array.from(this.gameboy.saveState());
      for (let [e, { state_slot }] of Object.entries(SLICED_MEMORIES)) {
        state[state_slot] = this.gameboy._unproxiedMemory[e];
      }
      state[207] = this.gameboy.CPUCyclesTotalCurrent;
      state[208] = this.gameboy.JoyPad;
      return msgpack.deserialize(msgpack.serialize(state)); // deep copy to avoid others changing this data after the fact
    },
    restoreState: function (state) {
      this.gameboy.returnFromState(state);
      this.gameboy.CPUCyclesTotalCurrent = state[207];
      this.gameboy.JoyPad = state[208];
      for (let [e, { state_slot }] of Object.entries(SLICED_MEMORIES)) {
        this.gameboy._unproxiedMemory[e] = state[state_slot];
        this.gameboy[e] = new Proxy(this.gameboy[e], {
          get: (target, prop) => {
            if (this.onMemoryAccess) {
              this.onMemoryAccess(e, prop);
            }
            return target[prop];
          },
        });
      }
    },
    onTransition: function (lifecycle, ...args) {
      console.info(
        "transition:",
        lifecycle.transition,
        lifecycle.from,
        "->",
        lifecycle.to
        //...args
      );

      gtag("event", "screen_view", {
        app_name: "tenmile",
        screen_name: lifecycle.to,
      });

      this.canvas.classList.remove(lifecycle.from);
      this.canvas.classList.add(lifecycle.to);

      if (
        this.gameboy != null &&
        !identicalArrays(this.gameboy._unproxiedMemory["ROM"], this.currentROM)
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

        this.runInterval = setInterval(() => {
          try {
            pollGamepad();
          } catch (exception) {
            console.warn("Exception during pollGamepad():", exception);
          }
          try {
            this.gameboy.run();
          } catch (exception) {
            console.warn("Exception during gameboy.run():", exception);
          }
        }, EMULATOR_LOOP_INTERVAL);

        this.gameboy._unproxiedJoyPadEvent = this.gameboy.JoyPadEvent;
        this.gameboy.JoyPadEvent = new Proxy(this.gameboy.JoyPadEvent, {
          apply: (target, thisArg, argumentsList) => {
            if (this.onJoyPadEvent) {
              this.onJoyPadEvent(argumentsList);
            }
            return this.gameboy._unproxiedJoyPadEvent.apply(
              thisArg,
              argumentsList
            );
          },
        });

        this.gameboy._unproxiedRun = this.gameboy.run;
        this.gameboy.run = new Proxy(this.gameboy.run, {
          apply: (target, thisArg, argumentsList) => {
            if (this.onRun) {
              this.onRun();
            }
            this.gameboy._unproxiedRun.apply(thisArg, argumentsList);
          },
        });

        this.gameboy._unproxiedMemory = {};

        for (let e of Object.keys(SLICED_MEMORIES)) {
          this.gameboy._unproxiedMemory[e] = this.gameboy[e];
          this.gameboy[e] = new Proxy(this.gameboy[e], {
            get: (target, prop) => {
              if (this.onMemoryAccess) {
                this.onMemoryAccess(e, prop);
              }
              return target[prop];
            },
          });
        }
      }

      if (this.gameboy) {
        document.title = lifecycle.to + " " + this.gameboy.name;
        this.status.innerText = lifecycle.to + " " + this.gameboy.name;

        gtag("event", lifecycle.to, {
          event_category: lifecycle.transition,
          event_label: this.gameboy.name,
        });
      } else {
        this.status.innerText = "Nothing loaded yet.";
      }
    },
    onAfterTransition: function (lifecycle) {
      if (this.state != "idle") {
        this.button.style.visibility = "visible";
      } else {
        this.button.style.visibility = "hidden";
      }
    },

    onBeforeDropQuote: function (lifecycle, quote) {
      this.currentQuote = quote;
      this.currentROM = quote.state[0];
    },

    onEnterWatching: function () {
      this.button.value = "Take control";

      this.restoreState(this.currentQuote.state);

      let oob = false;

      this.onMemoryAccess = (e, prop) => {
        if (fsm.currentQuote.masks[e][prop] != 1) {
          oob = e;
        }
      };

      let iteration = 0;

      this.onRun = () => {
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

        if (oob) {
          console.warn("Resetting after OOB while *watching*. " + oob);
          oob = false;
          fsm.restoreState(fsm.currentQuote.state);
          iteration = 0;
        }
      };

      this.onJoyPadEvent = () => {
        // interpret input as trying to grab control
        fsm.tap();
      };
    },

    onLeaveWatching: function () {
      this.onMemoryAccess = null;
      this.onRun = null;
      this.onJoyPadEvent = null;
    },

    onBeforeDropGame: function (lifecycle, rom) {
      if (this.currentQuote) {
        let match = true;
        for (let i = 0; i < rom.length; i++) {
          if (
            this.currentQuote.masks["ROM"][i] == 1 &&
            this.currentROM[i] != rom[i]
          ) {
            match = false;
          }
        }
        if (
          match &&
          confirm("Continue play with inserted ROM? Play may be unreliable.")
        ) {
          this.currentQuote = null;
          this.currentROM = rom;
          // hack to continue play with complete ROM
          this.gameboy._unproxiedMemory["ROM"] = rom;
          this.gameboy.ROM = new Proxy(rom, {
            get: (target, prop) => {
              if (this.onMemoryAccess) {
                this.onMemoryAccess("ROM", prop);
              }
              return target[prop];
            },
          });
          return;
        }
      }
      this.currentROM = rom;
    },

    onEnterPlaying: function () {
      this.button.value = "Record new quote";

      // [jf] this ... sort of works? Investigate more later
      /*
      this.gameboy._unproxiedMemory = this.gameboy.memory;
      let seen = {};
      this.gameboy.memory = new Proxy(this.gameboy.memory, {
        set: function(target, addr, value) {
        if(addr == 0xFF00 && !seen[value]) {
          console.log(value)
          // 47 = b0010 1111
          // 31 = b0001 1111
          // 63 = b0011 1111
          seen[value] = true;
        }
        target[addr] = value;
        return true;
      }});
      */
    },

    onLeavePlaying: function () {
      // [jf] this ... sort of works? Investigate more later
      // this.gameboy.memory = this.gameboy._unproxiedMemory;
    },

    onEnterRecording: function () {
      this.currentTrace = new Trace();
      this.currentTrace.name = this.gameboy.name;
      this.currentTrace.initialState = this.saveState();
      this.currentTrace.initialFrameBuffer = this.gameboy.frameBuffer.slice(0);
      this.currentTrace.actions = [];
      this.currentTrace.memoryDependencies = {};
      for (let e of Object.keys(SLICED_MEMORIES)) {
        this.currentTrace.memoryDependencies[e] = new Set();
      }

      let actionsSinceLastIteration = [];

      this.onRun = () => {
        this.currentTrace.actions.push(actionsSinceLastIteration);
        actionsSinceLastIteration = [];
      };

      // [jf] Adam, observing the TICKTable should get us clock accurate replays. For example:
      // See my notes on the Game Boy Online emulator for details
      //
      // Note that the ticks get really big, really fast
      /*
      let tickCount = 0;
      this.gameboy.TICKTable = new Proxy(this.gameboy.TICKTable, {
        get: function(target, prop) {
          if (tickCount not in fsm.currentTrace.tickActions) {
            fsm.currentTrace.tickActions[tickCount] = [];
          }
          fsm.currentTrace.tickActions[tickCount].push(actionsSinceLastIteration);
          return target[prop];
          tickCount++;
        }
      });
      /* */

      this.onJoyPadEvent = (args) => {
        actionsSinceLastIteration.push(args);
      };

      this.onMemoryAccess = (e, prop) => {
        this.currentTrace.memoryDependencies[e].add(prop);
      };

      function updateRecordingStatus() {
        let percentage =
          fsm.currentTrace.memoryDependencies["ROM"].size /
          fsm.currentROM.length;
        fsm.status.innerText =
          Number(percentage).toLocaleString(undefined, {
            style: "percent",
            minimumFractionDigits: 2,
          }) + " of ROM accessed.";
      }

      this.button.value = "Stop recording";
      this.recordingStatusInterval = setInterval(updateRecordingStatus, 500);
    },

    onLeaveRecording: function () {
      this.status.innerText = "";
      clearInterval(this.recordingStatusInterval);
      this.onRun = null;
      this.onJoyPadEvent = null;
      this.onMemoryAccess = null;
    },

    onEnterCompiling: function () {
      this.button.value = "Compiling...";
      this.button.disabled = true;
      compileQuote(this.currentTrace).then((res) => {
        displayQuote(res);
        fsm.complete();
      });
    },

    onLeaveCompiling: function () {
      this.button.disabled = false;
      this.restoreState(this.currentTrace.initialState);
      this.currentTrace = null;
    },

    onEnterRiffing: function () {
      this.button.value = "Watch pre-recorded play";

      let oob = false;

      this.onMemoryAccess = (e, prop) => {
        if (this.currentQuote.masks[e][prop] != 1) {
          oob = e;
        }
      };

      this.onRun = () => {
        if (oob) {
          console.log("Resetting after OOB. " + oob);
          oob = false;
          this.restoreState(this.currentQuote.state);
        }
      };
    },

    onLeaveRiffing: function () {
      this.onMemoryAccess = null;
      this.onRun = null;
    },
  },
});

const keyToButton = {
  ArrowRight: "right",
  ArrowLeft: "left",
  ArrowUp: "up",
  ArrowDown: "down",
  x: "a",
  z: "b",
  Shift: "select",
  Enter: "start",
};

const buttonToKeycode = {
  right: 0,
  left: 1,
  up: 2,
  down: 3,
  a: 4,
  b: 5,
  select: 6,
  start: 7,
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

async function onPageLoad() {
  // keydown and keyup are what we use to get key events into the Game Boy
  document.addEventListener("keydown", handleKey, false);
  document.addEventListener("keyup", handleKey, false);
  // The Button is a multi-use button that has different uses depending on the state of the emulator
  document.getElementById("button").onclick = () => fsm.can("tap") && fsm.tap();

  // enable drag & drop operations onto the emulator
  document.getElementById("screen").ondragover = (ev) => ev.preventDefault();
  document.getElementById("screen").ondrop = (ev) => {
    ev.preventDefault();
    for (let item of ev.dataTransfer.files) {
      processFile(item);
    }
  };

  document.getElementById("sound").onchange = (checkbox) => {
    fsm.updateVolume();
  };

  document.getElementById("upload").onclick = (e) => {
    let input = document.createElement("input");
    input.type = "file";
    input.onchange = (e) => {
      let file = e.target.files[0];
      const blob = new Blob([file], { type: file.type });
      const blobUrl = URL.createObjectURL(blob);
      dropByUrl(blobUrl);
    };
    input.click();
  };

  // print out the buttons based on the value of the buttonToKey mapping
  let buttonToKey = {};
  Object.keys(keyToButton).forEach((key) => {
    buttonToKey[keyToButton[key]] = key;
  });

  const controls =
    "A/B/Start/Select with " +
    [
      buttonToKey["a"],
      buttonToKey["b"],
      buttonToKey["start"],
      buttonToKey["select"],
    ].join("/");
  document.getElementById("controls").textContent = controls;

  let buttons = document.querySelectorAll(".button");
  let buttonsArray = Array.prototype.slice.call(buttons);
  buttonsArray.forEach(function (element) {
    if (element.id.startsWith("button-")) {
      // "pointer" events encapsulate touch, mouse, etc
      element.addEventListener("pointerdown", handleButton);
      element.addEventListener("pointerup", handleButton);
      element.addEventListener("pointedrcancel", handleButton);
    }
  });
  let dPad = document.getElementById("d-pad");
  const dPadRect = dPad.getBoundingClientRect();
  function dPadClosure(event) {
    handleDPad(event, dPadRect);
  }
  dPad.addEventListener("pointerdown", dPadClosure);
  dPad.addEventListener("pointermove", dPadClosure);
  dPad.addEventListener("pointerup", dPadClosure);
  dPad.addEventListener("pointercancel", dPadClosure);

  if (window.location.hash.startsWith("#drop=")) {
    let url = window.location.hash.split("=")[1];
    gtag("event", "hash url", {
      event_label: url,
    });
    dropByUrl(url);
  }
}

function sendButtonPress(name, down) {
  /* This is very useful for debugging: */
  // console.log("Button pressed:", name, down ? "down" : "up");
  if (fsm.gameboy) {
    fsm.gameboy.JoyPadEvent(buttonToKeycode[name], down);
  }
}

function handleKey(event) {
  event.preventDefault();
  let key = event.key;
  if (key in keyToButton) {
    sendButtonPress(keyToButton[key], event.type == "keydown");
  }
}

function handleDPad(event, rect) {
  event.preventDefault();
  let x = event.offsetX;
  let y = event.offsetY;
  let a = y / x < 1.0 ? true : false;
  let b = x / (rect.height - y) < 1.0 ? true : false;
  let direction = "";
  if (a == b) {
    direction = a ? "up" : "down";
  } else {
    direction = a ? "right" : "left";
  }

  if (event.type == "pointerdown" && dpadDirection == null) {
    dpadDirection = direction;
    sendButtonPress(dpadDirection, true);
  } else if (event.type == "pointerup" && dpadDirection) {
    sendButtonPress(dpadDirection, false);
    dpadDirection = null;
  } else if (
    event.type == "pointermove" &&
    dpadDirection &&
    dpadDirection != direction
  ) {
    sendButtonPress(dpadDirection, false);
    sendButtonPress(direction, true);
    dpadDirection = direction;
  }
}

function handleButton(event) {
  event.preventDefault();
  let div = event.target;
  let buttonName = div.id.split("-")[1];
  let buttonDown = event.type == "pointerdown" ? true : false;
  if (buttonDown) {
    div.classList.remove("up");
    div.classList.add("down");
  } else {
    div.classList.remove("down");
    div.classList.add("up");
  }

  sendButtonPress(buttonName, buttonDown);
}

async function dropByUrl(url) {
  fsm.status.innerText = "Fetching data...";
  let file = await fetch(url);
  await processFile(file);
}

async function processFile(file) {
  fsm.status.innerText = "Decoding data...";
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

async function displayQuote({ blob, filename }) {
  let img = document.createElement("img");
  img.src = URL.createObjectURL(blob);

  let download = document.createElement("span");
  download.classList.add("icon-download");
  download.onclick = async (e) => {
    let a = document.createElement("a");
    a.href = img.src;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  let share = document.createElement("span");
  share.classList.add("icon-share");
  share.onclick = async (e) => {
    console.log("uploading file");
    share.classList.remove("icon-share");
    share.classList.add("icon-spin");
    share.classList.add("animate-spin");
    let fd = new FormData();
    fd.append("file", blob, filename);
    let res = await fetch("/upload", { method: "POST", body: fd });
    if (!res.ok) {
      console.log("Error POSTing image", res);
    }
    let rv = await res.json();
    console.log(rv);
    window.open(`#drop=${rv.url}`);

    share.classList.remove("icon-spin");
    share.classList.remove("animate-spin");
    share.classList.add("icon-share");
  };

  let play = document.createElement("span");
  play.classList.add("icon-play");
  play.onclick = async (e) => {
    dropByUrl(img.src);
  };

  let trash = document.createElement("span");
  trash.classList.add("icon-trash");
  trash.onclick = async (e) => {
    e.target.parentElement.parentElement.outerHTML = "";
  };

  let container = document.createElement("div");
  container.appendChild(img);

  let toolsContainer = document.createElement("span");
  container.appendChild(toolsContainer);

  toolsContainer.classList.add("quote-tools");
  toolsContainer.appendChild(download);
  toolsContainer.appendChild(share);
  toolsContainer.appendChild(play);
  toolsContainer.appendChild(trash);

  document.getElementById("quotes").appendChild(container);
}

window.addEventListener("DOMContentLoaded", (event) => {
  onPageLoad();
});

let lastGamepadState = {start: true};
function pollGamepad() {
  for (let gamepad of navigator.getGamepads()) {
    if (gamepad && gamepad.mapping == "standard") {
      const defaultMapping = {
        a: [1,3],
        b: [0,2],
        select: [8,10,4,6],
        start: [9,11,5,7],
        up: [12],
        down: [13],
        left: [14],
        right: [15],
      };
      for (let [k, vs] of Object.entries(defaultMapping)) {
        const pressed = vs.map(v => gamepad.buttons[v].pressed).includes(true);
        if ((pressed && !lastGamepadState[k]) || (!pressed && lastGamepadState[k])) {
          sendButtonPress(k, pressed);
        }
        lastGamepadState[k] = pressed;
      }
    }
  }
}
