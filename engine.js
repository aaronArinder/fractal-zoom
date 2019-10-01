/*
 * This is a fractal zoom generator for the Mandelbrot set. The big idea is to spawn ffmpeg,
 * generate frames at different levels of zoom, and pipe them to ffmpeg. To speed things up,
 * I'm using node's cluster module. See the README for where this project is headed.
 * */

'use strict';

const cluster  = require('cluster');
const { pipe } = require('./utilities');
let ffmpeg;

/*
 * MASTER PROCESS
 * */
if (cluster.isMaster) {
  const numCPUs     = require('os').cpus().length;
  const FRAME_COUNT = parseInt(process.argv.slice(2)[0]);

  if (FRAME_COUNT && FRAME_COUNT < 1) {
    console.log('Ahh, I see. You\'re one of those folks that don\'t read the README.\n');
    return;
  }

  /**
   * A configuration object to pipe through multiple functions, creating a whole out of the sum
   * of those functional parts.
   *
   * @typedef {Object} config
   * @property {Object} ffmpeg A spawned ffmpeg, with stdio pipes. See spawnFfmpeg() for details
   * @property {Number} frameIdx The current frame index being generated
   * @property {Number} frameToWrite The next frame to pipe to ffmpeg. It's important to keep
   *   track of which frame is next because we're multi-threaded and thereby have no guarantee
   *   in what order the frames will be generated
   * @property {Number} numCPUs The number of cores available for use
   * @property {Object} hash An object keyed by frame index, with buffered frames as values. This
   *   lets us collect frames in any order without being forced to use that order to pipe to
   *   ffmpeg. We'll look at the next frame to write for which key/value to pipe to ffmpeg
   * @property {Number} shutdownAttempts The number of loops we've told the child processes and
   *   pipes to close. For some reason, ffmpeg doesn't shut down gracefully as a child process.
   *   Sometimes, it creates a corrupted mp4. This is a hacky way to attempt a graceful close
   * @property {Number} totalFrames The total number of frames to generate
   */
  const config = {
    ffmpeg: spawnFfmpeg(),
    frameIdx: 0,
    frameToWrite: 1,
    numCPUs,
    hash: {},
    shutdownAttempts: 0,
    totalFrames: parseInt(FRAME_COUNT),
  }

  return pipe(config)(forkWorkers)(startWorkers)(consumeHash)();

/*
 * CHILD PROCESSES
 * */
} else {

  /**
   * An object of dependencies to close over in processMessage().
   *
   * @typedef {Object} deps
   * @property {Function} createCanvas Generates a blank canvas to make into a fractal frame
   * @property {Function} httpGET Makes an http request to the transform server
   * @property {Function} mandelbrot The math for generating a fractal frame
   */
  const deps = {
    createCanvas: require('canvas').createCanvas,
    httpGET: require('./utilities').httpGET,
    mandelbrot: require('./mandelbrot').mandelbrot,
  }

  /**
   * An event listener on the child process, listening for messages from the master process.
   * Those messages will be handled with processMessage(), and their content will be a number
   * representing which frame to generate.
   *
   * @typedef {Object} process The child process
   * @property {Function} process.on An event listener listening for `message` events, processing
   * their messages with processMessage()
   */
  process.on('message', processMessage(deps));
}

/**
 * Controls the generation of a fractal frame by calling mandelbrot() and then returning the
 * frame and current frame index back to the master process. This fn returns another function,
 * closing over the deps to abstract them away.
 *
 * @param {Object} deps Dependencies to close over, as documented above
 * @returns {Function} An asynchronous function that calls mandelbrot() and returns the generated
 * frame to the master process along with the current frame index
 */
function processMessage (deps) {
  const {
    Big,
    createCanvas,
    httpGET,
    mandelbrot,
  } = deps;

  return async ({ frameIdx }) => {
    /* some visual indication that frames are generating */
    console.log(frameIdx)

    try {
      /**
       * An config object for mandelbrot().
       * @typedef {Object} config
       * @property {Object} canvas A canvas to write the fractal frame to; mimics the DOM canvas
       * @property {Number} xmin The minimum x-axis val on the graph representing the fractal
       * @property {Number} xmax The maximum x-axis val on the graph representing the fractal
       * @property {Number} ymin The minimum y-axis val on the graph representing the fractal
       * @property {Number} ymax The maximum y-axis val on the graph representing the fractal
       * @property {Number} iterations The number of iterations to run the mandelbrot equation
       *   on to determine if the current vals tend toward infinity or not; if not, they're in
       *   the set. 250 isn't special; it's enough to be somewhat sure that we won't tend toward
       *   infinity, but not enough to be costly performance-wise
       * @property {Object} transforms The x- and y-axis points to center on as the graph zooms
       * @property {Number} zoom A multiplier that controls the zoom. 7 isn't special, but creates
       *   a snappy enough zoom
       */
      const config = {
        canvas: createCanvas(900, 600),
        xmin: -2,
        xmax: 1,
        ymin: -1,
        ymax: 1,
        iterations: 250,
        transforms: await httpGET('http://localhost:7777'),
        zoom: frameIdx / 7,
      };

      const mandelbrotFrame = await mandelbrot(config);
      const bufferedFrame = mandelbrotFrame.toBuffer();

      /* check that the channel is still open before attempting to send to it */
      if (process.channel) await process.send({ idx: frameIdx, frame: bufferedFrame });
      } catch (err) {
        console.error('err from catch', err);
      }
  };
}

/**
 * A function for forking as many workers as available cpu cores
 *
 * @param {Object} config The configuration object documented above
 * @returns {Object} The configuration object documented above
 */
function forkWorkers (config) {
  for (let i = 0; i < config.numCPUs; i++) {
    const worker = cluster.fork();

    /**
     * A forked worker process with an IPC set up to the master process. When a message comes in
     * from the worker, the master takes the content of the message, a frame index and buffered
     * frame, puts the frame in the hash with the index as key, and iterates the next frame to
     * generate
     *
     * @const worker
     * @typedef {Object} A forked process, represented as an object
     * @property {Function} on A function that takes in an object with a frame index and buffer,
     *   returning a pipe that puts the buffer into the hash and then iterates the next frame
     */
    worker.on('message', ({ idx, frame }) => {
      return pipe({ config, idx, frame })(frameToHash)(iterate)();
    });
  }
  return config;
}

/**
 * Iterates the next frame to generate, randomly selecting a worker to process the next frame.
 *
 * @param {Object} config The configuration object documented above
 */
function iterate (config) {
  /* get a number between 1 and however many cores are available to mimic cluster's round-robin
   * selection when used on a server
   * */
  const randomNumber = Math.floor(Math.abs(Math.random() * config.numCPUs)) + 1;
  const selectedWorker = cluster.workers[randomNumber];

  if (config.frameIdx <= config.totalFrames)
    selectedWorker.send({ frameIdx: ++config.frameIdx });
}

/**
 * Start generating frames by sending messages to the workers!
 *
 * @param {Object} config The configuration object documented above
 * @returns {Object} The configuration object documented above
 */
function startWorkers (config) {
  for (const id in cluster.workers) {
    const worker = cluster.workers[id];
    worker.send({ frameIdx: ++config.frameIdx });
  }
  return config;
}

/**
 * Buffer the frame and put it on the hash with the index as its key. This keeps the order of frames right when piping to ffmpeg. We use `config.frameToWrite` to guide which key's value to pipe
 *
 * @param {Object} config The configuration object documented above
 * @param {String} idx A string representing the index; don't let the string confuse you, it
 *   comes over that way via IPC, and there's no use parseInting it because the object key will
 *   be a string
 * @param {Objectl} frame The frame converted to a buffer via node-canvas's toBuffer(). We care
 *   about the data prop, which has a set of ints representing the buffer
 * @returns {config} The configuration object documented above
 */
function frameToHash ({ config, idx, frame }) {
  config.hash[idx] = Buffer.from(frame.data);
  return config;
}

/**
 * A generator function that looks at the hash, takes its keys (i.e., the frame indicies) and
 * values (i.e., the buffered frames), yielding them to an async iterator for consumption to
 * ffmpeg
 *
 * @generator
 * @function generateFrame
 * @param {Object} config The configuration object documented above
 * @yields {Array} entry An array, [ frame index, buffered frame ]
 */
function * generateFrame (config) {
  const currentKeysAndValues = Object.entries(config.hash);
  for (const entry of currentKeysAndValues)
    yield entry;
};

/**
 * An asynchronous iterator for the generator above, generateFrame(). This takes in whatever
 * frames have been put onto the hash, writes them to ffmpeg, and then deletes the frame off of
 * the hash via config.hash. The config.frameToWrite prop is essential. It determines which frame
 * we care to take off of the hash next, preserving order
 *
 * @param {Object} config The configuration object documented above
 * @returns {Object} The configuration object documented above
 */
async function writeFrame (config) {
  try {
    for await (const [ frame, chunk ] of generateFrame(config)) {
      if (parseInt(frame) === config.frameToWrite) {
        config.ffmpeg.stdin.write(chunk);
        config.frameToWrite++;
        delete config.hash[frame];
      }
    }
    return config;
  } catch (err) {
    console.error('err from writeFrame', err);
  }
}

/**
 * Controls the consumption of the hash. This is important because with multiple threads, we can
 * easily overshoot how many frames to consume. This function gates consumption. It also calls
 * itself on the next tick (to avoid blowing the stack), calling writeFrame() to check whether
 * any new frames have been put on the hash
 *
 * @param {Object} config The configuration object documented above
 * @returns {Object} A setImmediate object that puts consumeHash() onto the next tick
 */
function consumeHash (config) {
  if (config.frameToWrite >= config.totalFrames) {
    return shutdown(config);
  } else {
    writeFrame(config);
    return setImmediate(consumeHash, config);
  }
}

/**
 * Logic for attempting to shut down the child processes and pipes. It gets invoked 3 times, a
 * randomly chosen number that seems to help prevent ffmpeg from shutting down improperly and
 * corrupting the mp4. I've been running into trouble with ffmpeg as a child process. For large
 * fractal zooms (10k+) it won't generate a moov atom. I think that's because it's not shutting
 * down properly. Either way, super, super annoying. This is some jank shit acting like a
 * bandaid until I have more time to figure it out
 *
 * @param {Object} config The configuration object documented above
 */
async function shutdown (config) {
  config.shutdownAttempts++;
  console.log(`shutdown loop ${config.shutdownAttempts} of 3`);
  /* call process.exit() after three attempts at gracefully shutting down */
  if (config.shutdownAttempts >= 3) process.exit();
  else {
    await config.ffmpeg.stdin.end();
    /* disconnect and close all children; run shutdown() again after all are _supposedly_ closed.
     * In practice, they don't seem to close properly all the time
     * */
    await cluster.disconnect(() => setTimeout(shutdown, 5000, config));
  }
}

/**
 * Spawns ffmpeg, which is used to pipe fractal frames to to create an mp4 of the zoom
 *
 * @returns {Object} An object representing the spawned ffmpeg. This gets placed on the
 * configuration object documented above
 */
function spawnFfmpeg () {
  const { spawn } = require('child_process');
  return spawn(
    'ffmpeg',
    // check out the ffmpeg man page for what these options do
    ['-y', '-i', 'pipe:', '-r', '30', 'fractal-zoom.mp4'],
    // spawn options: pipes for stdin, stdout, and stderr
    { stdio: ['pipe'] }
  );
}
