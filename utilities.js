'use strict';

const http = require('http');

module.exports = {
  httpGet,
  pipe,
}

/**
 * A function that makes functional composition easy (and beautiful). Its use looks like this:
 *
 *   pipe(someArg)(fn_a)(fn_b)(fn_c)();
 *
 * Note the invocation at the end of the pipe. The pipe composes functions in point-free style, but
 * you must still invoke the composed functions.
 *
 * @param {Any} arg Anything may be passed in as the argument
 * @returns {Function} A function composed of the functions passed to it, with `arg` passed in to
 * each
 */
function pipe (arg) {
  return (fn) => {
    return fn ? pipe(fn(arg)) : arg;
  };
}

/**
 * A wrapper around an http call to the redis-like server holding the transform data
 *
 * @param {String} url The url to hit; in this case, 'localhost:7007'
 * @returns {Promise} An unresolved promised, which eventually resolves to the transform data
 * returned from the server
 */
function httpGet (url) {
  return new Promise((resolve, reject) => {
    return http.get(url, (res) => {
      return res.on('data', data => resolve(JSON.parse(data)));
    });
  });
}
