/*
 * Based on code from Rosetta Code. This is the math and handling for generating one frame of the
 * fractal zoom.
 * */

'use strict';

const http = require('http');
const { httpPOST } = require('./utilities');

module.exports ={
  mandelbrot,
};

/**
 * The iterator that determines whether some point is within or without the Mandelbrot set.
 *
 * @param {Number} cx The original x-axis value
 * @param {Number} cy The original y-axis value
 * @param {Number} maxIter Total number of iterations to run before determing a point is within the set
 * @returns {Number} The difference between the maximum number of iterations allowed and the
 * total number of iterations that occured while determining whether the point is in the set
 */
function mandelIter (cx, cy, maxIter) {
  let x  = 0;
  let y  = 0;
  let xx = 0;
  let yy = 0;
  let xy = 0;

  let iter = maxIter;
  /*
   * if either the x or y values, squared, are 2 or greater, the point isn't within the set;
   * so, if both added together are equal to or greater than 4, we know it's not in the set
   * */
  while (iter-- && xx + yy <= 4) {
    xy = x * y;
    xx = x * x;
    yy = y * y;

    /* find the real part of the complex number */
    x = xx - yy + cx; // add cx to preserve original x value
    /* find the imaginary part */
    y = xy + xy + cy; // add cy to preserve the original y value
  }

  // this determines the 'brightness' of the pixel
  return maxIter - iter;
}

/**
 * Generates a frame of the fractal zoom at some level of zoom
 *
 * @param {Object} {canvas A canvas object, from node-canvas, that starts blank and has its
 * pixels colored depending on whether the point they represent is within or without the
 * Mandelbrot set
 * @param {Number} xmin The x-axis minimum
 * @param {Object} xmax The x-axis maximum
 * @param {Number} ymin The y-axis minimum
 * @param {Number} ymax The y-axis maximum
 * @param {Number} iterations The number of iterations to use in the mandelIter() to determine
 * whether the point is within or without the Mandelbrot set. 250 is a somewhat low number, and
 * it's arbitrary; it gives us good reason to think that if particular number hasn't started
 * tending toward positive or negative infinity, it won't, but we don't get certainty
 * @param {Number} zoom A moidifer for zoom level
 * @param {Object} transforms} An object of x- and y-axes that the zoom should center on to keep
 * the frames riding the edge of the fractal; without centering, they'll fall into either the set
 * or outside of it
 * @returns {Object} A prepared canvas ready for buffering and piping to ffmpeg
 */
async function mandelbrot ({ canvas, xmin, xmax, ymin, ymax, iterations, zoom, transforms }) {
  const { transformX, transformY } = transforms;
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, width, height);
  const pix = img.data;

  // width for-loop
  for (var ix = 0; ix < width; ++ix) {
    // height for-loop
    for (var iy = 0; iy < height; ++iy) {
      let y = (ymin + (((ymax - ymin) * iy) / (height - 1)));
      let x = (xmin + (((xmax - xmin) * ix) / (width - 1)));

      x = x/(zoom * zoom);
      y = y/(zoom * zoom);

      // if the distance between y and the previous y is great
      if (transformX && transformY) {
        x = x+(transformX);
        y = y+(transformY);
      }

      const i = mandelIter(x, y, iterations);

      if (i < iterations && (-0.8 < x && x < -0.7) && (0 < y && y < 0.1))
        if (transformX > x && transformY < y) {
          await httpPOST(JSON.stringify({
            transformX: x,
            transformY: y,
          }));

        }

      const ppos = 4 * (width * iy + ix);

      /*
       * Color/shade the pixels based on how long it took to determine whether the point was in
       * or out of the Mandelbrot set. Black if within the set, otherwise a shade determined by
       * how many iterations it took to figure out it wasn't in the set.
       * */

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
