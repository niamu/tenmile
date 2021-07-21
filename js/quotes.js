/* global PNGBaker, JSZip, UPNG, msgpack */

class Quote {
  /*rom;
  romMask;
  state;
  actions;*/
}

class Trace {
  /*initialState;
  initialFrameBuffer;
  actions;
  romDependencies;*/
}

async function loadQuote(buffer) {
  let quote = new Quote();

  let png = new PNGBaker(buffer);
  let fileArrays = {};
  let jszip = new JSZip();
  let zip = await jszip.loadAsync(png.chunk);
  for (let filename of Object.keys(zip.files)) {
    fileArrays[filename] = await zip.file(filename).async("uint8array");
  }

  let frameBuffer = new Int32Array(160 * 144);
  let rgba = UPNG.toRGBA8(UPNG.decode(buffer))[0];
  for (let i = 0; i < frameBuffer.length; i++) {
    frameBuffer[i] += rgba[4 * i + 0] << 16;
    frameBuffer[i] += rgba[4 * i + 1] << 8;
    frameBuffer[i] += rgba[4 * i + 2] << 0;
  }

  quote.rom = fileArrays.rom;
  quote.romMask = fileArrays.rom_mask;

  if (fileArrays.action_log) {
    quote.actions = msgpack.deserialize(fileArrays.action_log);
  }
  let state = msgpack.deserialize(fileArrays.savestate);

  const SAVESTATE_ROM = 0;
  const SAVESTATE_FRAMEBUFFER = 71;

  state[SAVESTATE_ROM] = fileArrays.rom;
  state[SAVESTATE_FRAMEBUFFER] = frameBuffer;

  quote.state = state;

  return quote;
}

async function compileQuote(trace) {
  // How many bytes to store per address observed
    const PAGE_SIZE = 64;
    const SAVESTATE_ROM = 0;
    const SAVESTATE_FRAMEBUFFER = 71;
  
    let rom = trace.initialState[0];

    let zip = new JSZip();
    let maskedROM = new Uint8Array(rom.length);
    let mask = new Uint8Array(rom.length);
    let pages = new Set();
    for (let address of trace.romDependencies) {
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

    for (let i = 0; i < 0x134; i++) {
      maskedROM[i] = 0;
      mask[i] = 0;
    }
    for (let i = 0x134; i < 0x14d; i++) {
      maskedROM[i] = rom[i];
      mask[i] = 1;
    }

    let state = trace.initialState;
    state[SAVESTATE_ROM] = null;
    state[SAVESTATE_FRAMEBUFFER] = null;

    zip.file("rom", maskedROM);
    zip.file("rom_mask", mask);
    zip.file("savestate", msgpack.serialize(state));
    if (trace.actions) {
      zip.file("action_log", msgpack.serialize(trace.actions));
    }

    let binary = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });

    let rgba = [];
    for (let pixel of trace.initialFrameBuffer) {
      rgba.push((pixel & 0xff0000) >> 16);
      rgba.push((pixel & 0x00ff00) >> 8);
      rgba.push((pixel & 0x0000ff) >> 0);
      rgba.push(0xff);
    }

    let png = new PNGBaker(UPNG.encode([rgba], 160, 144, 0));
    png.chunk = binary;
    let img = document.createElement("img");
    let blobUrl = URL.createObjectURL(png.toBlob());
    img.src = blobUrl;

    document.getElementById("quotes").appendChild(img);
}