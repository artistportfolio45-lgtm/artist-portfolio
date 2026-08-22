import { getStore } from "@netlify/blobs";
import { createSyncPublicPortfolioHandler } from "./lib/portfolio-functions-core.mjs";

export default createSyncPublicPortfolioHandler({ getStore });

