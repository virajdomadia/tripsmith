// Static image imports (`import hero from '@/assets/home/hero.jpg'`) are typed as
// `StaticImageData` by `next/image-types/global`, which Next wires up through the generated
// `next-env.d.ts`. That file is git-ignored (`web/.gitignore`), so a clean checkout — CI — has
// no declaration for `*.jpg` and `tsc --noEmit` fails on every one of those imports. Reference
// the types from a file that is committed instead.
/// <reference types="next/image-types/global" />
