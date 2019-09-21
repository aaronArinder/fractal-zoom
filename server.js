'use strict';

/*
 * big idea is to create a redis-like server to share data/memory between processes
 *   - clarify
 * */

const http = require('http');
const { URLSearchParams } = require('url');

const port = 7007;

const transforms = {
  transformX: 0,
  transformY: 0,
};

const server = http.createServer((req, res) => {
  // do something with req here
  //const frameCount = URLSearchParams();
  if (req.method === 'POST') {
    console.log('in post!')
    req.on('data', (data) => {
      const newTransforms = JSON.parse(data);
      transforms.transformX = newTransforms.transformX;
      transforms.transformY = newTransforms.transformY;
    });

    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end();

    });
  }
  res.end(JSON.stringify(transforms));
});

server.listen(port, (err) => {
  console.log('howdy from port', port);
  if (err) return console.log('woops', err);
});
