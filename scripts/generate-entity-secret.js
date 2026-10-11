// Generates the RSA key pair and hex-encoded Entity Secret for Circle.
// Run once: `npm run setup`

import crypto from "node:crypto";
import fs from "node:fs";

// Generate a 4096-bit RSA key pair
const { publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 4096,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// Entity Secret = 32 random bytes, hex-encoded (Circle's format)
const entitySecret = crypto.randomBytes(32).toString("hex");

// Save the public key (you'll paste this into the Circle console)
fs.writeFileSync("entity-secret.key", publicKey);

// Update .env with the generated entity secret
let env = fs.readFileSync(".env", "utf8");
env = env.replace(
  /CIRCLE_ENTITY_SECRET=.*/,
  `CIRCLE_ENTITY_SECRET=${entitySecret}`,
);
fs.writeFileSync(".env", env);

console.log("\n✓ Entity Secret generated and saved to .env");
console.log("✓ RSA public key saved to entity-secret.key\n");
console.log("Next steps:");
console.log("1. Paste your testnet API key into .env");
console.log("2. Go to Circle Console → Developer → Entity Secret");
console.log("3. Upload the file entity-secret.key (RSA public key)");
console.log("4. Copy the Entity Secret from .env and register it there too\n");
