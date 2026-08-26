import { next } from "@vercel/functions";
import { sitePasswordGateResponse } from "./src/site-password-gate.js";

export default async function middleware(request) {
  return (await sitePasswordGateResponse(request)) || next();
}
