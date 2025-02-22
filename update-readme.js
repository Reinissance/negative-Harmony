const fs = require("fs");

// Load examples.json
const examples = JSON.parse(fs.readFileSync("examples.json", "utf-8"));

// Log to debug the structure
console.log("Parsed examples.json:", examples);

// Create an array of artists with their songs
const exampleEntries = Object.entries(examples).map(([artist, songs]) => {
  // Get the song names and join them into a single string
  const songList = Object.keys(songs).join(" ");
  return {
    name: `${artist} - ${songList}`,
    url: Object.values(songs)[0] // Take the first song's URL (optional)
  };
});

// Read README.md
let readme = fs.readFileSync("README.md", "utf-8");

// Define a section to be replaced
const startMarker = "<!-- EXAMPLES_START -->";
const endMarker = "<!-- EXAMPLES_END -->";

const exampleSection = exampleEntries
  .map((ex) => `- [${ex.name}](${ex.url})`)
  .join("\n");

readme = readme.replace(
  new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "g"),
  `${startMarker}\n${exampleSection}\n${endMarker}`
);

// Write updated README.md
fs.writeFileSync("README.md", readme);
console.log("README.md updated!");
