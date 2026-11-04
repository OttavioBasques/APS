const MAP = { express: 'express.mjs', cors: 'cors.mjs', ioredis: 'ioredis.mjs' };
export async function resolve(specifier, context, nextResolve) {
  if (MAP[specifier]) return { url: new URL('./' + MAP[specifier], import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
