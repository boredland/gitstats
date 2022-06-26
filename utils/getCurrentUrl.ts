import { VercelRequest } from "@vercel/node";

const getCurrentUrl = (req: VercelRequest) => {
  const currentUrl = new URL(
    `https://stas.jonas-strassel.de${req.url}`
  );
  if (req.headers["x-forwarded-host"]) {
    currentUrl.host = req.headers["x-forwarded-host"] as string;
  }
  return currentUrl.toString();
};

export default getCurrentUrl;