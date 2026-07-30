declare module "cloudflare:workers" {
  export const env: {
    DB?: any;
  };
}

interface Fetcher {
  fetch(input: Request): Promise<Response>;
}

type D1Database = any;

