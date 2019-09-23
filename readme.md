#### Math for mandelbrot set
1) The mandelbrot set is the set of complex numbers, c, whose upper and lower limits never reach positive or negative infinity (i.e., is bounded) in a particular sequence. The sequence is this:

2) The mandelbrot set is the set of complex numbers who, under a recursive function, don't grow to infinity or shrink to negative infinity.

```
z_0 = 0
z_(n + 1) = z(2/n) + c
```

 check out youtube videos for turning mandelbrot set into javascript

 mandelbrot set function: f_c(z) => z^2 + c, starting with z equal to 0, determines which complex
 numbers c are in the set of complex numbers that don't tend to infinity

 f(0) => 0^2 + c;
 z = c;
 f(c) => c^2 + c;
   c^2 === (a + bi)(a + bi)
 so, f(c) = (a + bi)(a + bi) + c. And since (a + bi)(a +bi) is a^2 + abi + abi + (b^2)(i^2),
 f(c) = a^2 + 2abi - b^2 + c.

 rewritten: f(c) = a^2 - b^2 + 2abi + c. This is on the complex number plane, and we can figure
 out which points are in the mandelbrot set by figuring out whether a^2 - b^2 + 2ab tends toward
 infinity when z begins at 0. We've stripped the i off.

 (a^2 - b^2) + (2abi + c)


#### Random notes
If your iterate gets larger than 2, it'll blow up to infinity. So, all points in the mandelbrot set are smaller than or equal to 2.

Coloring to the mandelbrot graphs are added by giving color to those points that take a long time to get big and those that take a short time to get big. That's how shading works.
