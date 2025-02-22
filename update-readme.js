const fs = require("fs");

// Load examples.json
const examples = JSON.parse(fs.readFileSync("examples.json", "utf-8"));

// Read README.md
let readme = fs.readFileSync("README.md", "utf-8");

// Define a section to be replaced
const startMarker = "<!-- EXAMPLES_START -->";
const endMarker = "<!-- EXAMPLES_END -->";
const exampleSection = examples
  .map((ex) => `- [${ex.name}](${ex.url})`)
  .join("\n");

readme = readme.replace(
  new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "g"),
  `${startMarker}\n${exampleSection}\n${endMarker}`
);

// Write updated README.md
fs.writeFileSync("README.md", readme);
console.log("README.md updated!");
