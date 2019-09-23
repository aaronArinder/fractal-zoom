'use strict';

const cluster = require('cluster');
const { pipe, prepareFunctions }    = require('./utilities');
let ffmpeg;

if (cluster.isMaster) {
  const { once }    = require('events');
  const numCPUs     = require('os').cpus().length;
  const FRAME_COUNT = parseInt(process.argv.slice(2)[0]);

  if (FRAME_COUNT && FRAME_COUNT < 1) {
    console.log('Ahh, I see. You\'re one of those folks that don\'t read the README.\n');
    return;
  }

  const config = {
    ffmpeg: spawnFfmpeg(),     // ffpmeg child process
    frameIdx: 0,               // current frame being iterated
    frameToWrite: 1,           // keeps frames in order
    numCPUs,                   // number of cores on machine
    once,
    hash: {},
    fns: {},
    shutdownAttempts: 0,
    totalFrames: parseInt(FRAME_COUNT),
    closedFns: {
      PLACEHOLDER: setConfigToPLACEHOLDER,
    }
  }

  return pipe(config)(prepareFunctions)(forkWorkers)(startWorkers)(consumeHash)();

} else {

  const PLACEHOLDER2 = setPLACEHOLDER2({
    Big: require('big.js').Big,
    createCanvas: require('canvas').createCanvas,
    httpGet: require('./utilities').httpGet,
    mandelbrot: require('./mandelbrot').mandelbrot,
  });

  process.on('message', PLACEHOLDER2);
}

function setPLACEHOLDER2 (deps) {
  const {
    Big,
    createCanvas,
    httpGet,
    mandelbrot,
  } = deps;

  return async function PLACEHOLDER2 ({ frameIdx }) {
    try {
      const config = {
        canvas: createCanvas(900, 600),
        xmin: -2,
        xmax: 1,
        ymin: -1,
        ymax: 1,
        iterations: 250,
        transforms: await httpGet('http://localhost:7007'),
        zoom: frameIdx / 7,
      };

      const PLACEHOLDER = await mandelbrot(config);
      const bufferedCanvas = PLACEHOLDER.toBuffer();
      // check that the channel is still open before attempting to send to it
      if (process.channel) await process.send({ idx: frameIdx, frame: bufferedCanvas });
      } catch (err) {
        console.log('err from catch', err);
      }
  };
}

function forkWorkers (config) {
  // TODO: for in
  for (let i = 0; i < config.numCPUs; i++) {
    const worker = cluster.fork();
    worker.on('message', config.fns.PLACEHOLDER);
  }
  return config;
}

// TODO: doesn't need to be async
// TODO: rename: no closing here
function iterate (config) {
  // get a number between 1 and however many cores you have
  const randomNumber = Math.floor(Math.abs(Math.random() * config.numCPUs)) + 1;
  // and use it to call a worker. When listening on a port, cluster calls workers
  // round-robin; we're faking that here: could be that the luck of the draw puts more
  // labor on a particular worker over others; alas, such is life
  const selectedWorker = cluster.workers[randomNumber];

  if (config.frameIdx <= config.totalFrames)
    selectedWorker.send({ frameIdx: ++config.frameIdx });

  return;
}

//TODO: rename
function setConfigToPLACEHOLDER (config) {
  return ({ idx, frame }) => {
    console.log('idx', idx)
    // set frame to hash and send message to random worker
    pipe({ config, idx, frame })(frameToHash)(iterate)();
  };
}

function startWorkers (config) {
  for (const id in cluster.workers) {
    const worker = cluster.workers[id];
    worker.send({ frameIdx: ++config.frameIdx });
  }
  return config;
}

function frameToHash ({ config, idx, frame }) {
  const testFrame = new Buffer(frame);
  config.hash[idx] = testFrame;
  return config;
}

function * generateFrame (config) {
  const currentKeysAndValues = Object.entries(config.hash);
  for (const entry of currentKeysAndValues)
    yield entry;
};

//TODO: make recursive? I don't like that this has a setTimeout
async function consumeHash (config) {
  try {
    for await (const [ frame, chunk ] of generateFrame(config)) {
      if (parseInt(frame) === config.frameToWrite) {
        config.ffmpeg.stdin.write(chunk);
        config.frameToWrite++;
        delete config.hash[frame];
      }
    }

    if (config.frameToWrite >= config.totalFrames) {
      console.log('closing ffmpeg and child processes')
      // not sure this timeout did anything worthwhile; still hung
      return setImmediate(shutdown, config);
    } else
      return setImmediate(consumeHash, config);
  } catch (e) {
    console.error(e);
  }
}

async function shutdown (config) {
  console.log(`shutdown attempt ${config.shutdownAttempts} of 10`)
  config.shutdownAttempts++

  if (config.shutdownAttempts > 10) {
    process.exit();
  } else {
    await config.ffmpeg.stdin.end();
    //TODO: promisify?
    await cluster.disconnect(() => shutdown(config));
  }
}

function spawnFfmpeg () {
  const { spawn } = require('child_process');
  return spawn(
    // what we're spawning: ffmpeg
    'ffmpeg',
    //fmpeg options
    // check out the ffmpeg man page for what these options do
    ['-y', '-i', 'pipe:', '-r', '30', 'fractal-zoom.mp4'],
    // spawn options: pipes for stdin, stdout, and stderr
    { stdio: ['pipe'] } // TODO: inherit?
  );
}
