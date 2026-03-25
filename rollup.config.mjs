import terser from '@rollup/plugin-terser';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/index.js',
  external: ['three'],
  output: [
    {
      file: 'dist/flipfolio.esm.js',
      format: 'es',
      globals: { three: 'THREE' },
    },
    {
      file: 'dist/flipfolio.esm.min.js',
      format: 'es',
      globals: { three: 'THREE' },
      plugins: [terser()],
    },
    {
      file: 'dist/flipfolio.umd.js',
      format: 'umd',
      name: 'FlipFolio',
      globals: { three: 'THREE' },
    },
    {
      file: 'dist/flipfolio.umd.min.js',
      format: 'umd',
      name: 'FlipFolio',
      globals: { three: 'THREE' },
      plugins: [terser()],
    },
  ],
  plugins: [
    copy({
      targets: [{ src: 'src/flipfolio.css', dest: 'dist' }],
    }),
  ],
};
