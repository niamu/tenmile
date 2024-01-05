"use strict";
import {
  loadQuote,
  SLICED_MEMORIES,
  BORDER_SIZE,
} from "./quotes.js";

class PlayableQuote extends HTMLElement {
  constructor() {
    super();
  }

  loadLib(url) {
    let head = document.querySelector("head");
    return new Promise((resolve, reject) => {
      const existingScript = head.querySelector("script[src='" + url + "']");
      if (existingScript) {
        existingScript.addEventListener("load", function () {
          resolve(url);
        });
        existingScript.addEventListener("error", function (error) {
          reject(error);
        });
        return;
      }
      let script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = url;

      script.onload = function () {
        resolve(url);
      }
      script.onerror = function (error) {
        reject(error);
      }

      head.appendChild(script);
    });
  }

  connectedCallback() {
    if (!window.gtag) window.gtag = function() {};
    const img = this.querySelector("img");
    if (!(img && img.src)) {
      console.error("component does not contain an img with a src attribute.", this);
      return;
    }
    this.image = img;
    this.autoplay = this.getAttribute("autoplay") != null;
    this.controls = this.getAttribute("controls") != null;

    this.THIRD_PARTY_LIBS = [
      "lib/jszip-3.6.0.min.js",
      "lib/pako-2.0.3.min.js",
      "lib/UPNG-2.2.0.js",
      "lib/msgpack-1.0.3.js",
      "lib/emitter-1.3.0.js",
      "lib/resampler-899c314.js",
      "lib/XAudioServer-899c314.js",
      "lib/gameboy-0.2.0.js",
      "lib/state-machine-3.1.0.js",
    ];

    // Load necessary libraries if not yet loaded
    Promise.all(
      this.THIRD_PARTY_LIBS.map((url) => {
        return this.loadLib(url);
      })
    ).then(
      _success => this.initQuote(),
      err => {throw new Error("Unable to load necessary libraries", { cause: err })}
    );
  }

  async initQuote() {
    this.imageBuffer = await fetch(this.image.src).then(res => res.arrayBuffer());
    this.quote = await loadQuote(this.imageBuffer);

    await this.initPlayer();
  }

  async initPlayer() {
    this.tabIndex = 0;

    this.keyHandler = this.handleKey();

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.image.width - (BORDER_SIZE * 2);
    this.canvas.height = this.image.height - (BORDER_SIZE * 2);
    this.canvas.style.position = "absolute";
    this.canvas.style.margin = BORDER_SIZE + "px";
    this.canvas.style.top = 0;
    this.canvas.style.left = 0;
    this.appendChild(this.canvas);

    let controlsContainer = document.createElement("div");
    controlsContainer.classList.add("controls");

    this.button = document.createElement("button");
    this.button.innerText = this.autoplay ? "Take control" : "Load";
    if (this.controls || !this.autoplay) controlsContainer.appendChild(this.button);

    // The Button is a multi-use button that has different uses depending on the state of the emulator
    this.button.addEventListener("click", () => {
      if (!this.fsm) return;
      if (!this.gameboy) {
        if (!this.controls) {
          this.button.remove();
        }
        this.fsm.dropQuote(this.quote);
      } else {
        this.fsm.can("tap") && this.fsm.tap();
      }
    });

    let muteToggleLabel = document.createElement("label");
    let muteToggleLabelSpan = document.createElement("span");
    muteToggleLabelSpan.innerText = "Mute";

    this.muteToggle = document.createElement("input");
    this.muteToggle.type = "checkbox";
    this.muteToggle.checked = true;
    this.muteToggle.disabled = true;
    this.muteToggle.addEventListener("change", (_) => {
      if (!this.fsm) return;
      this.fsm.updateVolume();
    });
    muteToggleLabel.appendChild(this.muteToggle);
    muteToggleLabel.appendChild(muteToggleLabelSpan);
    controlsContainer.appendChild(muteToggleLabel);

    this.appendChild(controlsContainer);

    this.addEventListener("blur", () => {
      if (this.fsm.is("riffing")) {
        this.fsm.tap();
      }
    })

    // used by gameboy.js
    window.debug = function () {
      //console.log("debug:", ...arguments);
    };

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

    this.fsm = new StateMachine({
      init: "idle",
      transitions: [
        {
          name: "dropQuote",
          from: ["idle", "watching", "riffing"],
          to: "watching",
        },
        { name: "tap", from: "watching", to: "riffing" },
        { name: "tap", from: "riffing", to: "watching" },
      ],
      data: {
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
        updateVolume: () => {
          if (this.gameboy) {
            this.gameboy.opts.volume = this.muteToggle.checked ? 0 : 1;
            this.gameboy.changeVolume();
          }
        },
        saveState: () => {
          let state = Array.from(this.gameboy.saveState());
          for (let [e, { state_slot }] of Object.entries(SLICED_MEMORIES)) {
            state[state_slot] = this.gameboy._unproxiedMemory[e];
          }
          state[207] = this.gameboy.CPUCyclesTotalCurrent;
          state[208] = this.gameboy.JoyPad;
          return msgpack.deserialize(msgpack.serialize(state)); // deep copy to avoid others changing this data after the fact
        },
        restoreState: (state) => {
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
        onTransition: (lifecycle, ...args) => {
          console.log(
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

            this.gameboy.opts.volume = this.muteToggle.checked ? 0 : 1;

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
            gtag("event", lifecycle.to, {
              event_category: lifecycle.transition,
              event_label: this.gameboy.name,
            });
          }
        },
        onAfterTransition: (lifecycle) => {
          if (this.state != "idle") {
            this.button.style.visibility = "visible";
          } else {
            this.button.style.visibility = "hidden";
          }
        },

        onBeforeDropQuote: (lifecycle, quote) => {
          this.quote = quote;
          this.currentROM = quote.state[0];
        },

        onEnterWatching: () => {
          this.button.innerText = "Take control";
          this.muteToggle.disabled = false;

          this.fsm.restoreState(this.quote.state);

          let oob = false;

          this.onMemoryAccess = (e, prop) => {
            if (this.quote.masks[e][prop] != 1) {
              oob = [e, prop];
            }
          };

          let iteration = 0;

          this.onRun = () => {
            if (iteration >= this.quote.actions.length) {
              console.log("Resetting " + this.gameboy.name + " after end of recorded actions.");
              this.fsm.restoreState(this.quote.state);
              iteration = 0;
            } else {
              for (let action of this.quote.actions[iteration]) {
                this.gameboy._unproxiedJoyPadEvent(...action);
              }
              iteration++;
            }

            if (oob) {
              console.warn("Resetting " + this.gameboy.name + " after OOB while *watching*. ", oob);
              oob = false;
              this.fsm.restoreState(this.quote.state);
              iteration = 0;
            }
          };

          this.onJoyPadEvent = () => {
            // interpret input as trying to grab control
            this.fsm.tap();
          };
        },

        onLeaveWatching: () => {
          this.onMemoryAccess = null;
          this.onRun = null;
          this.onJoyPadEvent = null;
        },

        onEnterRiffing: () => {
          this.button.innerText = "Watch pre-recorded play";

          // keydown and keyup are what we use to get key events into the Game Boy
          this.addEventListener("keydown", this.keyHandler, false);
          this.addEventListener("keyup", this.keyHandler, false);

          let oob = false;

          this.onMemoryAccess = (e, prop) => {
            if (this.quote.masks[e][prop] != 1) {
              oob = [e, prop];
            }
          };

          this.onRun = () => {
            if (oob) {
              console.log("Resetting " + this.gameboy.name + " after OOB. ", oob);
              oob = false;
              this.fsm.restoreState(this.quote.state);
            }
          };
        },

        onLeaveRiffing: () => {
          this.onMemoryAccess = null;
          this.onRun = null;

          // remove keydown and keyup listeners if we are not riffing
          this.removeEventListener("keydown", this.keyHandler);
          this.removeEventListener("keyup", this.keyHandler);
        },
      },
    });

    if (this.autoplay) this.fsm.dropQuote(this.quote);
  }

  sendButtonPress(name, down) {
    /* This is very useful for debugging: */
    // console.log("Button pressed:", name, down ? "down" : "up");

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
    if (this.gameboy) {
      this.gameboy.JoyPadEvent(buttonToKeycode[name], down);
    }
  }

  handleKey() {
    return (event) => {
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
      let key = event.key;
      if (key in keyToButton) {
        event.preventDefault();
        this.sendButtonPress(keyToButton[key], event.type == "keydown");
      }
    }
  }
}

customElements.define("playable-quote", PlayableQuote);
