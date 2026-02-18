// server.js
// Express app entry point

import express from "express";
import tagRouter from "./api/tag.js";
import { fileURLToPath } from "node:url";

export const app = express();
app.use(express.json());
app.use("/api", tagRouter);

const PORT = process.env.PORT || 3001;
const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
