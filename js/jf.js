/* global GameBoyCore */


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



console.log("Hello world");
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
  let gbRunInterval = setInterval(function() {
    gameboy.run();
    gameboy.iterations += 1; // jf did this
    // console.log('tick');
  }, 8);
    
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
