import { getStore } from "@netlify/blobs";
import { createPublicPortfolioHandler } from "./lib/portfolio-functions-core.mjs";

export default createPublicPortfolioHandler({ getStore });

