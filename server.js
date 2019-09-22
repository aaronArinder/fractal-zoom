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

//TODO: error handling
const server = http.createServer(async (req, res) => {
  // do something with req here
  //const frameCount = URLSearchParams();
  if (req.method === 'POST') {
    //console.log('in post!')
    req.on('data', (data) => {
      const { transformX, transformY } = JSON.parse(data);
      if (transformX < transforms.transformX && transformY > transforms.transformY) {
        console.log('here')
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
  if (err) return console.log('woops', err);
});
