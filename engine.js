'use strict';

const cluster                     = require('cluster');
const { once }                    = require('events');

if (cluster.isMaster) {
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
} else {
  const http                          = require('http');
  const { Big }                       = require('big.js');
  const { createCanvas }              = require('canvas');
  const { mandelbrot }                = require('./mandelbrot');
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
};

