# Tritonize Web

This project brings [@minimaxir's](https://twitter.com/minimaxir) [Tritonize Python project](https://github.com/minimaxir/tritonize) to the web.

It turns any standard image...

_e.g. the risqué but widely referenced [Lenna portrait.](https://www.cs.cmu.edu/~chuck/lennapg/lenna.shtml)_

<p align="center">
  <img src="public/sampleImage.png">
</p>

...into a number of sketch-like images.

<p align="center">
  <img src="public/tritonize_collage.png">
</p>

## Tech Stack

- **React 18** with TypeScript for type-safe component development
- **Vite** for lightning-fast development and builds
- **Redux** for state management
- **pnpm** for efficient package management
- **HTML5 Canvas** for image manipulation - returns [Uint8ClampedArray](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8ClampedArray) representing each pixel. Image filters are applied by manipulating this array and painting back to canvas.

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## To Do:

- [x] Repeatedly load static image into DOM & Canvas (iterations depend on color permutations) and parse out image array.
- [x] Apply tritonize filter to canvas contents.
    - [x] Write result back into appropriate canvas.
- [ ] Add adjustable blur radius to image manipulation. Current tri-tone filter leaves a lot of grains on the image. Blur will help smooth contrasting edges.
- [ ] Color picker. Choose any (reasonable, given that page will render n! images) number of colors.
- [ ] Image drag & drop. Drop an image into the page and the page will take other settings (blur radius, possibly blur iterations -- one argument to the blur filter, and colors) and create display of all possible permutations!
- [ ] _Investigate [FabricJS?](fabricjs.com)_
