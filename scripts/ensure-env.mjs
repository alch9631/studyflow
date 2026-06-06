// Copy .env.example -> .env on first setup (no overwrite). Cross-platform.
import { copyFileSync, existsSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env already exists — leaving it as is.");
} else {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example (local SQLite default).");
}
