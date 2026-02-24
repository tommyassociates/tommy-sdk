const path = require('path')
const fs = require('fs')
const { build } = require('vite')
const helpers = require('../helpers')

// const env = process.env.NODE_ENV || 'production'

// External dependencies that addons can import
// These MUST match Tommy.provide() registry keys in tommy-core/src/addons.js
const EXTERNAL_DEPS = [
  'vue', 'vuex', 'vue-chartjs', 'chart.js', 'moment', 'dush',
  'spark-md5', 'framework7-vue', 'jszip', 'html2pdf.js'
];

// Globals map for IIFE output - maps external dep names to variable names
const GLOBALS = {
  vue: 'vue',
  vuex: 'vuex',
  'vue-chartjs': 'vue_chartjs',
  'chart.js': 'chartjs',
  moment: 'moment',
  dush: 'dush',
  'spark-md5': 'spark_md5',
  'framework7-vue': 'framework7_vue',
  'jszip': 'jszip',
  'html2pdf.js': 'html2pdf'
};

/**
 * Rollup output plugin that wraps IIFE bundle in Tommy.register() format.
 * This enables lazy dependency loading - addons only receive deps they declare.
 * @param {string} addonId - The addon package name
 */
function tommyRegisterPlugin(addonId) {
  return {
    name: 'tommy-register',
    generateBundle(options, bundle) {
      for (const [key, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;

        // Use Object.keys(globals) to ensure all externals are available
        // This is the safe fallback - per-addon detection via chunk.imports
        // can be enabled once proven reliable for IIFE output
        const globals = options.globals || {};
        const deps = Object.keys(globals);
        const params = deps.map(d => globals[d]);

        // Wrap the IIFE content in Tommy.register()
        // The addon ID is the first argument for race-safe keyed registration
        chunk.code = `Tommy.register(${JSON.stringify(addonId)}, ${JSON.stringify(deps)}, function(${params.join(', ')}) {
${chunk.code}
return addon;
});`;
      }
    }
  };
}

module.exports = async function(pkg, environment, version) {
  const localAddonFilePath = helpers.getLocalAddonFilePath(pkg, environment, version, '')
  console.log('addon building', pkg, environment, version) // , 'in', env

  const entry = path.join(localAddonFilePath, 'src/addon.js')
  const outDir = path.join(localAddonFilePath, 'build')
  console.log('addon building: entry', entry)
  console.log('addon building: out dir', outDir)

  // https://vitejs.dev/guide/build.html#library-mode
  const result = await build({
    build: {
      outDir,
      lib: {
        entry,
        name: 'addon',
        fileName: 'addon',
        formats: ['iife'],
      },
      emptyOutDir: true,
      rollupOptions: {
        external: EXTERNAL_DEPS,
        output: {
          assetFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'style.css')
              return 'addon.css'
          },
          globals: GLOBALS,
        },
        plugins: [tommyRegisterPlugin(pkg)],
      },
    },
  })

  // Rename to addon.js
  // This may be possible via Vite but this was easier
  fs.renameSync(outDir + '/addon.iife.js', outDir + '/addon.js')
  return result
}
