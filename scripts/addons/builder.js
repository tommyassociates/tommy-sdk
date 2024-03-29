const path = require('path')
const fs = require('fs')
const { build } = require('vite')
const helpers = require('../helpers')

// const env = process.env.NODE_ENV || 'production'

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
        external: ['vue', 'vuex', 'vue-chartjs', 'chart.js', 'moment', 'dush', 'spark-md5', 'framework7-vue'],
        output: {
          assetFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'style.css')
              return 'addon.css'
          },
          globals: {
            vue: 'vue',
            vuex: 'vuex',
            'vue-chartjs': 'vue_chartjs',
            'chart.js': 'chartjs',
            moment: 'moment',
            dush: 'dush',
            'spark-md5': 'spark_md5',
            'framework7-vue': 'framework7_vue'
          },
        },
      },
    },
  })

  // Rename to addon.js
  // This may be possible via Vite but this was easier
  fs.renameSync(outDir + '/addon.iife.js', outDir + '/addon.js')
  return result
}
