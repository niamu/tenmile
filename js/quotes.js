/* global PNGBaker, JSZip, UPNG, msgpack */

class Quote {
  contstructor() {
    this.rom = null;
    this.romMask = null;
    this.state = null;
    this.actions = null;
  }
}

class Trace {
  constructor() {
    this.initialState = null;
    this.actions = null;
    this.romDependencies = null;
  }
}

const SAVESTATE_ROM = 0;
const SAVESTATE_FRAMEBUFFER = 71;


function generateMaskedROM(rom, dependencies) {
  
  let maskedROM = new Uint8Array(rom.length);
  let mask = new Uint8Array(rom.length);
  
  // include any byte of a memory page associated with an address in dependencies
  const PAGE_SIZE = 64;  
  let pages = new Set();
  for (let address of dependencies) {
    pages.add(Math.floor(address / PAGE_SIZE));
  }
  for (let page of pages) {
    let startAddress = page * PAGE_SIZE;
    for (let i = 0; i < PAGE_SIZE; i++) {
      let address = startAddress + i;
      maskedROM[address] = rom[address];
      mask[address] = 1;
    }
  }

  // always remove entry point and logo (never needed for a quote of a specific moment)
  for (let i = 0x100; i < 0x134; i++) {
    maskedROM[i] = 0;
    mask[i] = 0;
  }
  
  // always include header (title + ROM/RAM size + etc.)
  for (let i = 0x134; i < 0x14d; i++) {
    maskedROM[i] = rom[i];
    mask[i] = 1;
  }
  
  return {maskedROM, mask};
}

async function loadQuote(buffer) {
  let quote = new Quote();

  let frameBuffer = new Int32Array(160 * 144);
  let rgba = UPNG.toRGBA8(UPNG.decode(buffer))[0];
  for (let i = 0; i < frameBuffer.length; i++) {
    frameBuffer[i] += rgba[4 * i + 0] << 16;
    frameBuffer[i] += rgba[4 * i + 1] << 8;
    frameBuffer[i] += rgba[4 * i + 2] << 0;
  }

  let fileArrays = {};
  let zip = await JSZip.loadAsync(buffer);
  for (let filename of Object.keys(zip.files)) {
    fileArrays[filename] = await zip.file(filename).async("uint8array");
  }

  quote.rom = fileArrays["rom.bin"];
  quote.romMask = fileArrays["romMask.bin"];

  quote.state = msgpack.deserialize(fileArrays["initialState.msgpack"]);
  quote.state[SAVESTATE_ROM] = quote.rom;
  quote.state[SAVESTATE_FRAMEBUFFER] = frameBuffer;

  quote.actions = msgpack.deserialize(fileArrays["actions.msgpack"]);

  return quote;
}

async function compileQuote(trace) {

  let {maskedROM, mask} = generateMaskedROM(
    trace.initialState[SAVESTATE_ROM],
    trace.romDependencies);

  let zip = new JSZip();
  
  let state = trace.initialState.slice();
  state[SAVESTATE_ROM] = null; // rom+mask stored in separate zip entries
  state[SAVESTATE_FRAMEBUFFER] = null; // stored in outer PNG

  zip.file("rom.bin", maskedROM);
  zip.file("romMask.bin", mask);
  zip.file("initialState.msgpack", msgpack.serialize(state));
  if (trace.actions) {
    zip.file("actions.msgpack", msgpack.serialize(trace.actions));
  }

  let zipBuffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  let rgba = [];
  for (let pixel of trace.initialState[SAVESTATE_FRAMEBUFFER]) {
    rgba.push((pixel & 0xff0000) >> 16);
    rgba.push((pixel & 0x00ff00) >> 8);
    rgba.push((pixel & 0x0000ff) >> 0);
    rgba.push(0xff);
  }

  let pngBuffer = UPNG.encode([rgba], 160, 144, 0);

  let blob = new Blob([pngBuffer, zipBuffer], {type:'image/png'});  
  let img = document.createElement("img");
  img.src = URL.createObjectURL(blob);
  document.getElementById("quotes").appendChild(img);
}