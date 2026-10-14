import { analyze } from './engine.js';
self.onmessage = ({ data }) => {
  const started = performance.now();
  try { self.postMessage({ ...analyze(data.board, data.rack, { bagEmpty: data.bagEmpty }), elapsed: performance.now() - started }); }
  catch (error) { self.postMessage({ errors: [`Search failed: ${error.message}`], moves: [] }); }
};
