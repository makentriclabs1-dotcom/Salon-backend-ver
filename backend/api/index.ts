// Vercel-specific entry point. Vercel automatically treats any file under /api
// as a serverless function — this just hands it the same Express app used
// everywhere else, unmodified, so behavior stays identical to local/Railway.
import { app } from "../src/app";

export default app;
