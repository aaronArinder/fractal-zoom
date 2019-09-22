'use strict';

const cluster                     = require('cluster');
const http                        = require('http');
const { promisify }               = require('util');
const { once }                    = require('events');
const { Big }                     = require('big.js');
const { createCanvas, loadImage } = require('canvas');

if (cluster.isMaster) {
  console.log(`Master PID: ${process.pid}`);
  const numCPUs = require('os').cpus().length;
  const spawn = require('child_process').spawn;
  const ffmpeg = spawn('ffmpeg', ['-y', '-i', 'pipe:', '-r', '30', '-deinterlace', 'a1.mp4'], { stdio: ['pipe'] });

  const queue =[];
  const hash = {};
  let frameIdx = 0;
  // start off 1 because it's always off by 1--why?
  let frameCount = 0;
  let frameToWrite = 1;
  let closing = false;

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();

    // add frameCount here
    worker.on('message', async ({ idx, frame }) => {
      console.log('idx', idx)
      try {
        const testFrame = new Buffer(frame); // somehow ends up an object?
        //queue.push(testFrame);
        hash[idx] = testFrame;

        const randomNumber = Math.floor(Math.abs(Math.random() * 10 - 2)) + 1;
        const selectedWorker = cluster.workers[randomNumber];
        if (frameIdx <= 250) selectedWorker.send({ frameIdx: ++frameIdx });
        else if (frameCount === frameIdx
          || frameCount + 1 === frameIdx
          || frameCount + 2 === frameIdx
          || frameCount + 3 === frameIdx
        ) {
          closing = true;
          await cluster.disconnect();
        }
        frameCount++;
      } catch (e) {
        console.error(e);
      }
    });
  }

  function * generateFrame () {
    const currentKeysAndValues = Object.entries(hash);
    //console.log('currentKeysAndValues', currentKeysAndValues)
    for (const entry of currentKeysAndValues)
      yield entry;
  };

  for (const id in cluster.workers) {
    const worker = cluster.workers[id];
    worker.send({ frameIdx: ++frameIdx, frameCount: ++frameCount });
  }
  const cache = {};
  iterHandler(cache);

  function iterHandler (cache) {
    (async function iterFn (cache) {
      try {
        for await (const [ frame, chunk ] of generateFrame()) {
          //console.log('frameToWrite', frameToWrite)
          if (parseInt(frame) === frameToWrite) {
            if (!ffmpeg.stdin.write(chunk)) {
              await once(ffmpeg.stdin, 'drain');
            }
            if (cache[frameToWrite]) delete cache[frameToWrite];
            delete hash[frameToWrite];
            frameToWrite++;
          } else if (cache[frameToWrite]) {
            // untested
            if (!ffmpeg.stdin.write(cache[frameToWrite])) {
              await once(ffmpeg.stdin, 'drain');
            }
            delete cache[frameToWrite];
            frameToWrite++;
          } else {
            // untested
            cache[frame] = chunk;
          }
        }

        if (!closing) setTimeout(iterHandler, 100, cache);
        else {
          ffmpeg.stdin.end();
          await once(ffmpeg.stdin, 'finish');
        }
      } catch (e) {
        console.error(e);
      }
    })(cache);
  }



  // check out youtube videos for turning mandelbrot set into javascript
  //
  // mandelbrot set function: f_c(z) => z^2 + c, starting with z equal to 0, determines which complex
  // numbers c are in the set of complex numbers that don't tend to infinity
  //
  // f(0) => 0^2 + c;
  // z = c;
  // f(c) => c^2 + c;
  //   c^2 === (a + bi)(a + bi)
  // so, f(c) = (a + bi)(a + bi) + c. And since (a + bi)(a +bi) is a^2 + abi + abi + (b^2)(i^2),
  // f(c) = a^2 + 2abi - b^2 + c.
  //
  // rewritten: f(c) = a^2 - b^2 + 2abi + c. This is on the complex number plane, and we can figure
  // out which points are in the mandelbrot set by figuring out whether a^2 - b^2 + 2ab tends toward
  // infinity when z begins at 0. We've stripped the i off.
  //
  // (a^2 - b^2) + (2abi + c)
  //

} else {
  process.on('message', async ({ frameIdx, frameCount }) => {
    // promisify this
    new Promise((resolve, reject) => {
      // TODO: remove frameCount or use it
      // send over frame
      http.get(`http://localhost:7007?frame=${frameCount}`, (res) => {
        res.on('data', data => resolve(JSON.parse(data)));
      });
    })
      .then(async (transforms) => {
      //console.log('transforms', transforms)

      const canvas = createCanvas(900, 600);
      const xmin = -2;
      const xmax = 1;
      const ymin = -1;
      const ymax = 1;
      const iterations = 250;
      const zoom = frameIdx/7;
      const PLACEHOLDER = await mandelbrot(canvas, xmin, xmax, ymin, ymax, iterations, zoom, transforms);
      const bufferedCanvas = PLACEHOLDER.toBuffer();
      // truthy if ipc channel still open
      if (process.channel) process.send({ idx: frameIdx, frame: bufferedCanvas });

      });
  });
}

function mandelIter (cx, cy, maxIter) {
  let x  = 0;
  let y  = 0;
  let xx = 0;
  let yy = 0;
  let xy = 0;

  let iter = maxIter;
  while (iter-- && xx + yy <= 4) {
    xy = x * y;
    xx = x * x; //sqr more performant?
    yy = y * y;

    // find the real part of the complex number
    x = xx - yy + cx; // add cx to preserve original x value
    // find the imaginary part
    y = xy + xy + cy; // add cy to preserve the original y value
  }

  // this determines the 'brightness' of the pixel
  return maxIter - iter;
}

async function mandelbrot (canvas, xmin, xmax, ymin, ymax, iterations, zoom, { transformX, transformY }) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, width, height);
  const pix = img.data;

  // width for-loop
  for (var ix = 0; ix < width; ++ix) {
    // height for-loop
    for (var iy = 0; iy < height; ++iy) {
      //const { transformX, transformY } = updateTransforms.retrieve();
      //let y = Big(ymin + (((ymax - ymin) * iy) / (height - 1)));
      //let x = Big(xmin + (((xmax - xmin) * ix) / (width - 1)));
      let y = (ymin + (((ymax - ymin) * iy) / (height - 1)));
      let x = (xmin + (((xmax - xmin) * ix) / (width - 1)));

      //x = x.div(zoom * zoom);
      //y = y.div(zoom * zoom);
      x = x/(zoom * zoom);
      y = y/(zoom * zoom);

      // if the distance between y and the previous y is great
      if (transformX && transformY) {
        //x = x.plus(transformX);
        //y = y.plus(transformY);

        x = x+(transformX);
        y = y+(transformY);
      }

      const i = mandelIter(x, y, iterations);

      if (i < iterations && (-0.8 < x && x < -0.7) && (0 < y && y < 0.1)) {
        // some kind of validation for changing transformX?
        //if (transformX > x && transformY < y) updateTransforms.update(x, y);
        if (transformX > x && transformY < y) {
          const transformsToSend = JSON.stringify({
            transformX: x,
            transformY: y,
          });

          const postOptions = {
            hostname: 'localhost',
            port: 7007,
            path: '/',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': transformsToSend.length
            }
          }

          // promisify this
          const result = await new Promise((resolve, reject) => {
            // send frame
            const req = http.request(postOptions, (res) => {
              res.on('data', chunk => resolve(chunk));
            });

            req.on('error', (err) => {
              return reject(err);
            });
            req.write(transformsToSend);
            req.end();
          }).catch(console.error);
        }
      }

      const ppos = 4 * (width * iy + ix);

      if (i > iterations) {
        pix[ppos] = 0;
        pix[ppos + 1] = 0;
        pix[ppos + 2] = 0;
      } else {
        var c = 3 * Math.log(i) / Math.log(iterations - 1.0);

        if (c < 1) {
          pix[ppos] = 255 * c;
          pix[ppos + 1] = 0;
          pix[ppos + 2] = 0;
        } else if ( c < 2 ) {
          pix[ppos] = 255;
          pix[ppos + 1] = 255 * (c - 1);
          pix[ppos + 2] = 0;
        } else {
          pix[ppos] = 255;
          pix[ppos + 1] = 255;
          pix[ppos + 2] = 255 * (c - 2);
        }
      }
      pix[ppos + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

