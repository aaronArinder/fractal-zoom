'use strict';

/*
 * The big idea is to have a redis-like server for sharing data between child processes. Each
 * process has an IPC channel to the master process, but no way of sharing 'memory' with its
 * siblings or the master process. This server listens for requests for transforms, x- and
 * y-points of where the center of the zoom should be, and it listens for requests for updating
 * those transforms.
 *
 * It's a simple http server and doesn't need to be something fancy like Express.
 * */

const http = require('http');
const { URLSearchParams } = require('url');

const port = 7777;

/**
 * This object records what to zoom in on. The smaller things get, the more important it is
 * to have the right center to zoom into; else, you end up in the chaotic abyss (all and only
 * those poinits in the mandelbrot set) or outside of chaos (in that lukewarm realm of
 * predictability).
 *
 * @typedef {Object} transforms
 * @property {Number} transformX The x-axis part of the center of the zoom
 * @property {Number} transformY The y-axis part of the center of the zoom
 */
const transforms = {
  transformX: 0,
  transformY: 0,
};

const server = http.createServer(async (req, res) => {
  /*
   * if POSTing, check that the new transforms are better than the old. For transformX to be
   * better, it must be lesser than the old one; for transformY, it must be greater than the
   * old one.
   * */
  if (req.method === 'POST') {
    req.on('data', (data) => {
      const { transformX, transformY } = JSON.parse(data);
      if (transformX < transforms.transformX && transformY > transforms.transformY) {
        transforms.transformX = transformX;
        transforms.transformY = transformY;
      }
    });

    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end();
    });
  }

  await res.end(JSON.stringify(transforms));
});

server.listen(port, (err) => {
  console.log('howdy from port', port);
  if (err) return console.error('woops', err);
});
