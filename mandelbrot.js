'use strict';

const { Big }                       = require('big.js');
const http                          = require('http');

module.exports ={
  mandelbrot,
};

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
