let gb = null;
console.log("Hello world");
loadGB();

async function loadGB() {
  let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
  let buffer = await (await fetch(resource)).arrayBuffer();
  let canvas = document.getElementById("screen")
  gb = GameBoyCore(canvas, buffer);
  gb.start();
  console.log(gb);
}
