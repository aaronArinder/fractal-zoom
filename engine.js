// some kind of loading message

'use strict';


const spawn = require('child_process').spawn;
const { once } = require('events');
const { Writable, Readable, Transform } = require('stream');
const ffmpeg = spawn('ffmpeg', ['-y', '-i', 'pipe:', '-r', '30', '-deinterlace', 'a1.mp4'], { stdio: ['pipe'] });


const { Big } = require('big.js');
const { createCanvas, loadImage } = require('canvas');

// add check for whatever version of node lets async gens work

const updateTransforms = (() => {
  const transformsObj = {
    transformX: 0,
    transformY: 0,
  };

  return {
    update: (transformX, transformY) => {
      transformsObj.transformX = transformX;
      transformsObj.transformY = transformY;
    },
    retrieve: () => transformsObj,
  };
})();



async function * generateCanvas () {
  // need next iterations to focus on a mandelbrot point, or else it just goes
  // through the center
  for (let i = 1; i <= 300; i++) {
    const canvas = createCanvas(900, 600);
    const xmin = -2;
    const xmax = 1;
    const ymin = -1;
    const ymax = 1;
    // maybe number of iterations matters for where the zoom point is
    const handledCanvas = mandelbrot(canvas, xmin, xmax, ymin, ymax, 250, i/10);
    yield handledCanvas.toBuffer();
  }
}

(async function() {
  let frame = 1;
  for await (const chunk of generateCanvas()) {
    console.log('frame ', frame++)
    if (!ffmpeg.stdin.write(chunk)) {
      await once(ffmpeg.stdin, 'drain');
    }
  }
  ffmpeg.stdin.end();
  await once(ffmpeg.stdin, 'finish');
})();


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

function mandelbrot (canvas, xmin, xmax, ymin, ymax, iterations, zoom) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, width, height);
  const pix = img.data;
  // width for-loop
  for (var ix = 0; ix < width; ++ix) {
    // height for-loop
    for (var iy = 0; iy < height; ++iy) {
      const { transformX, transformY } = updateTransforms.retrieve();
      let y = Big(ymin + (((ymax - ymin) * iy) / (height - 1)));
      let x = Big(xmin + (((xmax - xmin) * ix) / (width - 1)));

      x = x.div(zoom * zoom);
      y = y.div(zoom * zoom);

      // if the distance between y and the previous y is great
      if (transformX && transformY) {
        x = x.plus(transformX);
        y = y.plus(transformY);
      }



      const i = mandelIter(x, y, iterations);

      // need the right x, but how to determine what that is?
      // could be finding the right y, or the right distance
      // between ys
      if (i < iterations && -0.8 < x && x < -0.7 && 0 < y && y < 0.1) {
        // some kind of validation for changing transformX?
        if (transformX > x && transformY < y) updateTransforms.update(x, y);
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

