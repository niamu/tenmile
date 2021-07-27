function print(line) {
  document.getElementById("output").innerHTML += line + "<br/>";  
}

const zip_file = "https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fsweet-jesus.zip";
const png_file = "https://cdn.glitch.com/80f5a65b-f7e3-4b40-b639-8e2c014de0ca%2Fsweet-jesus-pooh.png";

function concatenate(first, second) {
  if(!first) { 
    return second;
  } else if (!second) {
    return first;
  }
  var combined = new Uint8Array(first.byteLength + second.byteLength);
  combined.set(new Uint8Array(first), 0);
  combined.set(new Uint8Array(second), first.byteLength);
  return combined.buffer;
}

(async function onPageLoad() {
  print("hello");
  print("world");
  let zip_buffer = await (await fetch(zip_file)).arrayBuffer();
  let png_buffer = await (await fetch(png_file)).arrayBuffer();

  let combined = concatenate(png_buffer, zip_buffer);
})();

/*
<!--
-->
*/