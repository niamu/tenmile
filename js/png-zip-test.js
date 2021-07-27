function print(line) {
  document.getElementById("output").innerHTML += "test<br/>";  
}

(async function onPageLoad() {
  document.getElementById("output").innerHTML += "test";
})();