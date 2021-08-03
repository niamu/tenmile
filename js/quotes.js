"use strict";
/* global JSZip, UPNG, msgpack */

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
    this.romDependencies = null;
  }
}

const SAVESTATE_ROM = 0;
const SAVESTATE_FRAMEBUFFER = 71;

const ARCHIVE_README_TEMPLATE = `
This archive represents a *playable quote* of a Game Boy game.

Playable quotes are delimited references to specific moments in a game along with a reference recording of how that moment of interactivity can play out.

* \`rom.bin\`: A Game Boy ROM image (comparable to many \`.gb\` files) with many bytes zeroed out. While the format of this file mostly matches that used by menu emulators, this ROM image *cannot* be used to boot the game.

* \`romMask.bin\`: This file is the same size as \`rom.bin\`, but it uses values 1 (valid) and 0 (invalid) to indicate which bytes of the ROM image are included in the quote. It should be possible to play back the recorded actions in the quote without ever reading from one of the invalid ROM addresses.

* \`initialState.msgpack\`: A [MessagePack](https://github.com/msgpack/msgpack-javascript) encoded savestate for a [specific Game Boy emulator](https://github.com/rauchg/gameboy). After decoding, entry 0 of the resulting array should be replaced with a reference to the contents of the ROM image above. Additionally, entry 71 should be replaced with a reference to a 160 * 144 entry Int32Array with the decoded contents of the encoding PNG file (representing the screen visible at the start of the recorded actions). There are some additional state variables stored in here that we should document as well. We are in the process of adding more to make replay more deterministic.

* \`actions.msgpack\`: A MessagePack-encoded array of instructions of which values to pass to \`gameboy.JoyPadEvent\` based on the number of previous calls to \`gameboy.run\`. Allowing the game to continue execution past the end of recorded actions (or attempting alternate actions) might result in reads to invalided ROM addresses. When this happens, it might be a good idea to return to the provided initial state.

Details about this specific quote:
DETAILS_GO_HERE
---
By Adam Smith (adam@adamsmith.as) and Joël Franusic (joel@franusic.com) in the year 2021.
`;

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

  return { maskedROM, mask };
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

async function digest256(data) {
  let digest = "";
  for (let byte of new Uint8Array(
    await crypto.subtle.digest("SHA-256", data)
  )) {
    digest += byte.toString(16).padStart(2, "0");
  }
  return digest;
}

async function compileQuote(trace) {
  console.log(trace.name);
  let originalROM = trace.initialState[SAVESTATE_ROM];

  let { maskedROM, mask } = generateMaskedROM(
    originalROM,
    trace.romDependencies
  );

  let originalBytes = originalROM.length;
  let includedBytes = originalROM.map(e => e == 1).reduce((a, b) => a + b, 0);

  let ROMDigest = await digest256(originalROM);
  console.log(ROMDigest);
  
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

  details += "- Original ROM SHA-256 digest: " + ROMDigest.toUpperCase() + "\n";
  details +=
    "- Reference gameplay recording: " +
    trace.actions.length +
    " emulator steps\n";

  let readme = ARCHIVE_README_TEMPLATE.slice().replace(
    "DETAILS_GO_HERE",
    details
  );
  console.log(details);

  let state = trace.initialState.slice();
  state[SAVESTATE_ROM] = null; // rom+mask stored in separate zip entries
  state[SAVESTATE_FRAMEBUFFER] = null; // stored in outer PNG

  let zip = new JSZip();
  zip.file("rom.bin", maskedROM);
  zip.file("romMask.bin", mask);
  zip.file("initialState.msgpack", msgpack.serialize(state));
  zip.file("actions.msgpack", msgpack.serialize(trace.actions));

  zip.file("README.md", readme);

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

  let pngBuffer = UPNG.encode([rgba], 160, 144, 0);

  
  // [jf] this might be a good place to split the function into two, so that we
  // can load
  let blob = new Blob([pngBuffer, zipBuffer], { type: "image/png" });
  let blobDigest = await digest256(await blob.arrayBuffer());
  console.log(blobDigest);
  let img = document.createElement("img");
  img.src = URL.createObjectURL(blob);
  
  let filename = `${trace.name}-${ROMDigest.slice(0,4)}-${blobDigest.slice(0,8)}.png`;
  
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
    let fd = new FormData();
    fd.append("file", blob, filename);
    let res = await fetch("/upload", { method: "POST", body: fd });
    if (!res.ok) {
      console.log("Error POSTing image", res);
    }
    let rv = await res.json()
    console.log(rv);
  };

  let play = document.createElement("span");
  play.classList.add("icon-play");
  
  let trash = document.createElement("span");
  trash.classList.add("icon-trash");
  trash.onclick = async (e) => {
    e.target.parentElement.parentElement.outerHTML = "";
  };
   
  let container = document.createElement("div");
  container.appendChild(img);
  
  let toolsContainer = document.createElement("span");
  container.appendChild(toolsContainer);
  
  toolsContainer.classList.add("quote-tools")
  toolsContainer.appendChild(download);
  toolsContainer.appendChild(share);
  toolsContainer.appendChild(play);
  toolsContainer.appendChild(trash);
  
  document.getElementById("quotes").appendChild(container);
}
