/* global GameBoyCore */

let gb = null;
console.log("Hello world");
loadGB();

async function loadGB() {
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let rom = new Uint8Array(buffer);
  console.log(buffer);
  let canvas = document.getElementById("screen")
  gb = GameBoyCore(canvas, rom, { drawEvents: true });
  gb.start();
  gb.run();
  console.log(gb);
  
  
  gb.on('draw', function(){
    console.log('.');
  });
}
