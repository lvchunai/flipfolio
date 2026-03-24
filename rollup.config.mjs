import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/flipfolio.esm.js',
      format: 'es',
    },
    {
      file: 'dist/flipfolio.esm.min.js',
      format: 'es',
      plugins: [terser()],
    },
    {
      file: 'dist/flipfolio.umd.js',
      format: 'umd',
      name: 'FlipFolio',
    },
    {
      file: 'dist/flipfolio.umd.min.js',
      format: 'umd',
      name: 'FlipFolio',
      plugins: [terser()],
    },
  ],
  plugins: [
    copy({
      targets: [{ src: 'src/flipfolio.css', dest: 'dist' }],
    }),
  ],
};
