const fs = require("fs");

// Load examples.json
const examples = JSON.parse(fs.readFileSync("examples.json", "utf-8"));

// Log to debug the structure
console.log("Parsed examples.json:", examples);

// Convert the object structure to a list of songs with artists
const exampleSection = Object.entries(examples)
  .map(([artist, songs]) => {
    // Create a list of links for each song
    const songLinks = Object.entries(songs)
      .map(([song, url]) => `[${song}](${url})`)
      .join(" ");

    // Return the formatted string for the artist and their songs
    return `- [${artist}](${url}) ${songLinks}`;
  })
  .join("\n");

// Read README.md
let readme = fs.readFileSync("README.md", "utf-8");

// Define a section to be replaced
const startMarker = "<!-- EXAMPLES_START -->";
const endMarker = "<!-- EXAMPLES_END -->";

// Replace the old section with the new one
readme = readme.replace(
  new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, "g"),
  `${startMarker}\n${exampleSection}\n${endMarker}`
);

// Write updated README.md
fs.writeFileSync("README.md", readme);
console.log("README.md updated!");
