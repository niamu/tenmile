/* global GameBoyCore */
const EMULATOR_LOOP_INTERVAL = 8;

const keyToButton = {
  "ArrowRight": "right",
  "ArrowLeft": "left",
  "ArrowUp": "up",
  "ArrowDown": "down",
  "x": "a",
  "z": "b",
  "Shift": "select",
  "Enter": "start"
};

const buttonToKeycode = {
  "right": 0, 
  "left": 1,
  "up": 2,
  "down": 3,
  "a": 4,
  "b": 5,
  "select": 6,
  "start": 7
};

window.debug = function() {
  console.log('debug:', ...arguments);
}

// https://github.com/jakesgordon/javascript-state-machine
const fsm = new StateMachine({
  init: "idle",
  transitions: [
    {name: "dropQuote", from: ["watching",
                               "riffing",
                              ""], to: "watching"},
  ],
  methods: {
    onStopped: function() {}
  }
});


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
  let canvas = document.getElementById("screen")
  let gameboy = GameBoyCore(canvas, rom, { drawEvents: true });
  gameboy.stopEmulator = 1; // required
  gameboy.start();
  
  // START HACKY JUNK
  let dateObj = new Date();
  gameboy.firstIteration = dateObj.getTime();
  gameboy.iterations = 0;
  let emulatorTicks = 0;
  let gbRunInterval = setInterval(function() {
    gameboy.run();
    emulatorTicks += 1;
    // console.log('tick');
  }, EMULATOR_LOOP_INTERVAL);
    
  gameboy.on('draw', function(){
    //console.log('.');
  });
  // END HACKY JUNK
  
  function handleKey(event) {
    let down = (event.type == "keydown")
    let key = event.key;
    if (key in keyToButton) {
      let keycode = buttonToKeycode[keyToButton[key]];
      gameboy.JoyPadEvent(keycode, down);
      console.log(keycode + " " + down + " at iteration " + gameboy.iterations)
    }
  }
  document.addEventListener("keydown", handleKey, false);
  document.addEventListener("keyup", handleKey, false);
}
