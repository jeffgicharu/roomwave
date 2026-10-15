import { fileURLToPath } from "node:url";

// This file sits directly in src/, and the bundle directly in dist/, so the
// same relative path finds the assets in development and in a release.
export const ASSET_DIR = fileURLToPath(new URL("../assets/", import.meta.url));
