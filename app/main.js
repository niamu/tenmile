define(function (require) {
    // Load any app-specific modules
    // with a relative require call,
    // like:
    var messages = require('messages');

    // Load library/vendor modules using
    // full IDs, like:
    var print = require('print');

    print(messages.getHello());
  
    document.getElementById("jf").innerHTML = "hello";
  
    startGameboy();
});

async function startGameboy() {
    let resource = "https://bonsaiden.github.io/Tuff.gb/roms/game.gb";
    let buffer = await (await fetch(resource)).arrayBuffer();
  
    var gb = require("gameboy");
    gb("screen", buffer);
  
}