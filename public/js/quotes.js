"use strict";

/* global JSZip, UPNG, msgpack */
/* global gtag */

const SLICED_MEMORIES = {
  ROM: {
    state_slot: 0
  },
  memory: {
    state_slot: 19
  },
  MBCRam: {
    state_slot: 20
  },
  VRAM: {
    state_slot: 21
  },
  GBCMemory: {
    state_slot: 23
  }
};

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
    this.name = null;
    this.initialState = null;
    this.actions = null;
    this.elementDependencies = null;
  }
}

const SAVESTATE_FRAMEBUFFER = 71;

const ROM_HEADER_START = 0x134;
const ROM_HEADER_END = 0x14d;

const PAGE_SIZE = 64;

const BORDER_SIZE = 12;

const ARCHIVE_README_TEMPLATE = `
This archive represents a *playable quote* of a Game Boy game.

Playable quotes are delimited references to specific moments in a game along with a reference recording of how that moment of interactivity can play out.

* \`ROM.bin\`: A Game Boy ROM image (comparable to many \`.gb\` files) with many bytes zeroed out. While the format of this file mostly matches that used by menu emulators, this ROM image *cannot* be used to boot the game.

* \`ROM.mask\`: This file is the same size as \`rom.bin\`, but it uses values 1 (valid) and 0 (invalid) to indicate which bytes of the ROM image are included in the quote. It should be possible to play back the recorded actions in the quote without ever reading from one of the invalid ROM addresses.

* \`initialState.msgpack\`: A [MessagePack](https://github.com/msgpack/msgpack-javascript) encoded savestate for a [specific Game Boy emulator](https://github.com/rauchg/gameboy). After decoding, entry 0 of the resulting array should be replaced with a reference to the contents of the ROM image above. Additionally, entry 71 should be replaced with a reference to a 160 * 144 entry Int32Array with the decoded contents of the encoding PNG file (representing the screen visible at the start of the recorded actions). There are some additional state variables stored in here that we should document as well. We are in the process of adding more to make replay more deterministic.

* \`actions.msgpack\`: A MessagePack-encoded array of instructions of which values to pass to \`gameboy.JoyPadEvent\` based on the number of previous calls to \`gameboy.run\`. Allowing the game to continue execution past the end of recorded actions (or attempting alternate actions) might result in reads to invalided ROM addresses. When this happens, it might be a good idea to return to the provided initial state.

Details about this specific quote:
DETAILS_GO_HERE
---
By Adam Smith (adam@adamsmith.as) and Joël Franusic (joel@franusic.com) in the year 2021.
`;

function generateMaskedMemory(
  memory,
  dependencies,
  useRomForcingPattern = false
) {
  let maskedMemory = new Uint8Array(memory.length);
  let mask = new Uint8Array(memory.length);

  // include any byte of a memory page associated with an address in dependencies
  let pages = new Set();
  for (let address of dependencies) {
    pages.add(Math.floor(address / PAGE_SIZE));
  }
  for (let page of pages) {
    let startAddress = page * PAGE_SIZE;
    for (let i = 0; i < PAGE_SIZE; i++) {
      let address = startAddress + i;
      maskedMemory[address] = memory[address];
      mask[address] = 1;
    }
  }

  if (useRomForcingPattern) {
    // always remove entry point and logo (never needed for a quote of a specific moment)
    for (let i = 0x100; i < ROM_HEADER_START; i++) {
      maskedMemory[i] = 0;
      mask[i] = 0;
    }

    // always include header (title + ROM/RAM size + etc.)
    for (let i = ROM_HEADER_START; i < ROM_HEADER_END; i++) {
      maskedMemory[i] = memory[i];
      mask[i] = 1;
    }
  }

  return { bin: maskedMemory, mask, original: memory };
}

async function compileQuote(trace) {
  let sliced = {};
  for (let [e, { state_slot }] of Object.entries(SLICED_MEMORIES)) {
    sliced[e] = generateMaskedMemory(
      trace.initialState[state_slot],
      trace.elementDependencies[e],
      e == "ROM"
    );
  }
  console.log(sliced);

  let originalBytes = sliced["ROM"].original.length;
  let includedBytes = sliced["ROM"].mask
    .map(e => e == 1)
    .reduce((a, b) => a + b, 0);

  let romDigest = await digest256(sliced["ROM"].original);

  let details = "";
  details +=
    "- Included original ROM bytes: " +
    includedBytes +
    " of " +
    originalBytes +
    " (" +
    Number(includedBytes / originalBytes).toLocaleString(undefined, {
      style: "percent",
      minimumFractionDigits: 2
    }) +
    ").\n";

  details += "- Original ROM SHA-256 digest: " + romDigest.toUpperCase() + "\n";
  details +=
    "- Reference gameplay recording: " +
    trace.actions.length +
    " emulator steps\n";

  let readme = ARCHIVE_README_TEMPLATE.slice().replace(
    "DETAILS_GO_HERE",
    details
  );

  gtag("event", "inclusion percent", {
    event_category: "quote compilation",
    event_label: trace.name,
    value: Math.floor((100 * includedBytes) / originalBytes)
  });

  gtag("event", "inclusion bytes", {
    event_category: "quote compilation",
    event_label: trace.name,
    value: Math.floor(includedBytes)
  });

  gtag("event", "actions length", {
    event_category: "quote compilation",
    event_label: trace.name,
    value: trace.actions.length
  });

  let state = trace.initialState.slice(); // slice is used to do a shallow copy here, different from notion of slicing above
  for (let [e, { state_slot }] of Object.keys(SLICED_MEMORIES)) {
    state[state_slot] = null; // this entry will be rebuilt from zip entries
  }
  state[SAVESTATE_FRAMEBUFFER] = null; // recoverable from outer png

  let zip = new JSZip();
  for (let [e,{bin,mask}] of Object.entries(sliced)) {
    zip.file(e+".bin", bin);
    zip.file(e+".mask", mask);
  }
  zip.file("initialState.msgpack", msgpack.serialize(state));
  zip.file("actions.msgpack", msgpack.serialize(trace.actions));

  zip.file("README.md", readme);
  console.log(zip);

  let zipBuffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  let rgba = [];
  for (let pixel of trace.initialState[SAVESTATE_FRAMEBUFFER]) {
    rgba.push((pixel & 0xff0000) >> 16);
    rgba.push((pixel & 0x00ff00) >> 8);
    rgba.push((pixel & 0x0000ff) >> 0);
    rgba.push(0xff);
  }

  let font = new FontFace(
    "Early GameBoy",
    'url("https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2FEarly%20GameBoy.woff?v=1627886220949")'
  );
  await font.load();
  document.fonts.add(font);

  let canvas = document.createElement("canvas");

  const sw = 160 * 2;
  const sh = 144 * 2;

  canvas.setAttribute("width", sw + 2 * BORDER_SIZE);
  canvas.setAttribute("height", sh + 2 * BORDER_SIZE);
  canvas.style.fontSmooth = "never";
  canvas.style.webkitFontSmoothing = "none";

  let ctx = canvas.getContext("2d");

  ctx.strokeStyle = "#444";
  ctx.fillStyle = "#ccc";
  ctx.arc(BORDER_SIZE, BORDER_SIZE, BORDER_SIZE - 1, -Math.PI, -Math.PI / 2);
  ctx.arc(sw + BORDER_SIZE, BORDER_SIZE, BORDER_SIZE - 1, -Math.PI / 2, 0);
  ctx.arc(sw, sh, 2 * BORDER_SIZE - 1, 0, Math.PI / 2);
  ctx.arc(
    BORDER_SIZE,
    sh + BORDER_SIZE,
    BORDER_SIZE - 1,
    Math.PI / 2,
    -Math.PI
  );
  ctx.lineTo(1, BORDER_SIZE);

  ctx.stroke();
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.strokeRect(BORDER_SIZE, BORDER_SIZE, sw, sh);

  let screenshotimageData = ctx.createImageData(160, 144);
  for (let i = 0; i < rgba.length; i++) {
    screenshotimageData.data[i] = rgba[i];
  }
  let screenshotImageBitmap = await createImageBitmap(screenshotimageData);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(screenshotImageBitmap, BORDER_SIZE, BORDER_SIZE, sw, sh);

  ctx.textAlign = "center";

  ctx.fillStyle = "#000";
  ctx.font = `${0.666 * BORDER_SIZE}px "Early GameBoy"`;
  ctx.fillText(trace.name, sw / 2 + BORDER_SIZE, 0.75 * BORDER_SIZE);

  ctx.fillStyle = "#888";
  ctx.fillText(
    `${includedBytes} rom bytes * ${trace.actions.length} steps`,
    sw / 2 + BORDER_SIZE,
    sh + BORDER_SIZE + 0.75 * BORDER_SIZE
  );

  ctx.save();
  ctx.translate(BORDER_SIZE + sw + 0.75 * BORDER_SIZE, BORDER_SIZE + sh / 2);
  ctx.rotate(-Math.PI / 2);

  ctx.fillText("[ 8bpp steg zip", 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(0.25 * BORDER_SIZE, BORDER_SIZE + sh / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("playable quote", 0, 0);
  ctx.restore();

  let quoteImageData = ctx.getImageData(
    0,
    0,
    sw + 2 * BORDER_SIZE,
    sh + 2 * BORDER_SIZE
  );

  let imgBytes = quoteImageData.data;
  let zipBytes = new Uint8Array(zipBuffer);
  if (zipBytes.length * 4 > imgBytes.length) {
    alert(
      "zip file too big to steganographically encode into image!" +
        ` ${zipBytes.length} bytes`
    );
  }
  let numBytes = zipBytes.length;
  for (let i = 0; i < numBytes; i++) {
    let x = zipBytes[i];
    imgBytes[4 * i + 0] = (imgBytes[4 * i + 0] & 0xfc) | ((x >> 6) & 0x3);
    imgBytes[4 * i + 1] = (imgBytes[4 * i + 1] & 0xfc) | ((x >> 4) & 0x3);
    imgBytes[4 * i + 2] = (imgBytes[4 * i + 2] & 0xfc) | ((x >> 2) & 0x3);
    imgBytes[4 * i + 3] = (imgBytes[4 * i + 3] & 0xfc) | ((x >> 0) & 0x3);
  }

  let pngBuffer = UPNG.encode(
    [imgBytes],
    sw + 2 * BORDER_SIZE,
    sh + 2 * BORDER_SIZE,
    0
  );

  let blob = new Blob([pngBuffer, zipBuffer], { type: "image/png" });

  let blobDigest = await digest256(await blob.arrayBuffer());
  let filename = `${trace.name}-${romDigest.slice(0, 4)}-${blobDigest.slice(
    0,
    8
  )}.png`;

  return { blob, filename };
}

async function loadQuote(buffer) {
  let quote = new Quote();

  let frameBuffer = new Uint32Array(160 * 144);
  let rgba = new Uint8Array(UPNG.toRGBA8(UPNG.decode(buffer))[0]);

  let decodedBytes = [];
  let frameBufferRgba = [];

  for (let i = 0; i < rgba.length / 4; i++) {
    let byte =
      ((rgba[4 * i + 0] & 0x3) << 6) +
      ((rgba[4 * i + 1] & 0x3) << 4) +
      ((rgba[4 * i + 2] & 0x3) << 2) +
      ((rgba[4 * i + 3] & 0x3) << 0);
    decodedBytes.push(byte);

    let x = Math.floor(i % (160 + 2 * BORDER_SIZE));
    let y = Math.floor(i / (160 + 2 * BORDER_SIZE));
    if (
      x >= BORDER_SIZE &&
      x < 160 + BORDER_SIZE &&
      y >= BORDER_SIZE &&
      y < 144 + BORDER_SIZE
    ) {
      frameBuffer[i] += rgba[4 * i + 0] << 16;
      frameBuffer[i] += rgba[4 * i + 1] << 8;
      frameBuffer[i] += rgba[4 * i + 2] << 0;
    }
  }

  let fileArrays = {};
  let zip = await JSZip.loadAsync(new Uint8Array(decodedBytes));
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

async function digest256(data) {
  let digest = "";
  for (let byte of new Uint8Array(
    await crypto.subtle.digest("SHA-256", data)
  )) {
    digest += byte.toString(16).padStart(2, "0");
  }
  return digest;
}
