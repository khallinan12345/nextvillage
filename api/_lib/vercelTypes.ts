// Local copy of the two request/response types the API routes use, so the
// whole @vercel/node package (and its build-tool dependency tree) isn't needed.
import type { IncomingMessage, ServerResponse } from 'http';

export type VercelRequest = IncomingMessage & {
  query: { [key: string]: string | string[] };
  cookies: { [key: string]: string };
  body: any;
};

export type VercelResponse = ServerResponse & {
  send: (body: any) => VercelResponse;
  json: (jsonBody: any) => VercelResponse;
  status: (statusCode: number) => VercelResponse;
  redirect: {
    (url: string): VercelResponse;
    (statusCode: number, url: string): VercelResponse;
  };
};
