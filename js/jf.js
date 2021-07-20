/* global GameBoyCore */


const GBKeyMap = {
  "right": 0, 
  "left": 1,
  "up": 2,
  "down": 3,
  "a": 4,
  "b": 5,
  "select": 6,
  "start": 7
};

const buttonMap = {
  "ArrowRight": "right",
  "ArrowLeft": "left",
  "ArrowUp": "up",
  "ArrowDown": "down",
  "x": "a",
  "z": "b",
  "Shift": "select",
  "Enter": "start"
};


function matchKey(key) {	//Maps a keyboard key to a gameboy key.
	//Order: Right, Left, Up, Down, A, B, Select, Start
	var keymap = ["right", "left", "up", "down", "a", "b", "select", "start"];	//Keyboard button map.
	for (var index = 0; index < keymap.length; index++) {
		if (keymap[index] == key) {
			return index;
		}
	}
	return -1;
}
function GameBoyEmulatorInitialized() {
	return (typeof gameboy == "object" && gameboy != null);
}
function GameBoyEmulatorPlaying() {
	return ((gameboy.stopEmulator & 2) == 0);
}

function GameBoyKeyDown(key) {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		GameBoyJoyPadEvent(matchKey(key), true);
	}
}
function GameBoyJoyPadEvent(keycode, down) {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		if (keycode >= 0 && keycode < 8) {
			gameboy.JoyPadEvent(keycode, down);
      console.log(keycode + " " + down + " at iteration " + gameboy.iterations)
		}
	}
}
function GameBoyKeyUp(key) {
	if (GameBoyEmulatorInitialized() && GameBoyEmulatorPlaying()) {
		GameBoyJoyPadEvent(matchKey(key), false);
	}
}

/* END hacky junk */

function handleKey(event) {
  let down = (event.type == "keydown")
  let key = event.key;
  if (key in buttonMap) {
    let gbKeycode = GBKeyMap[buttonMap[key]];
    gameboy.JoyPadEvent(gbKeycode, down);
    console.log(gbKeycode + " " + down + " at iteration " + gameboy.iterations)
  }
}

let gameboy = null;
console.log("Hello world");
loadGB();

// addEvent("keydown", document, keyDown)
document.addEventListener("keydown", handleKey, false);
document.addEventListener("keyup", handleKey, false);

async function loadGB() {
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let rom = new Uint8Array(buffer);
  console.log(buffer);
  let canvas = document.getElementById("screen")
  gameboy = GameBoyCore(canvas, rom, { drawEvents: true });
  gameboy.stopEmulator = 1; // required
  gameboy.start();
  
  // START HACKY JUNK
  let dateObj = new Date();
  gameboy.firstIteration = dateObj.getTime();
  gameboy.iterations = 0;
  let gbRunInterval = setInterval(function() {
    gameboy.run();
    gameboy.iterations += 1;
    // console.log('tick');
  }, 8);
    
  gameboy.on('draw', function(){
    //console.log('.');
  });
  // END HACKY JUNK
}
