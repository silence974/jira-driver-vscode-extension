export function buildBasicAuthorizationHeader(email: string, apiToken: string): string {
  const credentials = Buffer.from(`${email}:${apiToken}`, "utf8").toString("base64");
  return `Basic ${credentials}`;
}
