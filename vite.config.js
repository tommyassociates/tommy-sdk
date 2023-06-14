import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'node:url';

import packageJson from './package.json';

// import { ViteDevServer } from 'vite';

export function pluginWatchNodeModules(modules) {
	// Merge module into pipe separated string for RegExp() below.
	let pattern = `/node_modules\\/(?!${modules.join('|')}).*/`;
	return {
		name: 'watch-node-modules',
		configureServer: (server) => {
			server.watcher.options = {
				...server.watcher.options,
				ignored: [
					new RegExp(pattern),
					'**/.git/**',
				]
			}
		}
	}
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // const entries = Object.fromEntries(
  //   Object.entries(env).map(([key, val]) => {
  //   if (key.startsWith('TOMMY_')) {
  //     return [
  //       [`import.meta.env.${key}`, val],
  //       [`process.env.${key}`, val],
  //     ]
  //   }
  // }).filter(Boolean).flat());

  Object.entries(env).map(([key, val]) => {
    if (key.startsWith('TOMMY_')) {
      process.env[key] = val
    }
  })

  return {
    plugins: [vue(), pluginWatchNodeModules(['tommy-core'])],
    envPrefix: 'TOMMY_',
    // define: entries,
    server: {
      port: 8080,
      fs: {
        allow: [
          'addons',
          'src',
          'node_modules/@fontsource'
        ],
      },
    },
    resolve: {
      alias: [
        {
          find: '@',
          replacement: path.resolve(__dirname, 'src')
        },
        {
          find: 'tommy-core',
          replacement: path.resolve(__dirname, '../tommy-core')
        }
        // {
        //   find: '@addon',
        //   replacement: path.resolve(__dirname, '../tommy-sdk-private/addons')
        // }
        // '@addon': resolvePath('../tommy-sdk-private/addons'),
      ]
    },
    build: {
      chunkSizeWarningLimit: 600,
      cssCodeSplit: false,
      rollupOptions: {
        external: [
          'vuex',
          fileURLToPath(
            new URL(
              'node_modules/vuex/dist/vuex.esm-bundler.js',
              import.meta.url
            )
          ),
          /node_modules/
        ]
      }
    }
  }
});
