/* eslint-disable no-undef */
import { defineConfig } from 'vite';
import path from 'path';

// Config Hints:
// https://vitejs.dev/guide/build.html#multi-page-app

export default defineConfig({
    plugins: [
    ],
    build: {
        rollupOptions: {
            external: [
                'three',
                'three/examples/jsm/controls/TrackballControls',
                'three/examples/jsm/helpers/VertexNormalsHelper',
                'three/examples/jsm/loaders/MTLLoader'
            ],
            input: {
                index: path.resolve(__dirname, 'index.html'),
                obj2_basic: path.resolve(__dirname, 'obj2_basic.html'),
                obj2parallel_basic: path.resolve(__dirname, 'obj2parallel_basic.html'),
                obj2_options: path.resolve(__dirname, 'obj2_options.html'),
                wtm_potentially_infinite: path.resolve(__dirname, 'wtm_potentially_infinite.html')
            },
            plugins: [
            ]
        }
    },
    server: {
        port: 8085,
        host: '0.0.0.0'
    }
});