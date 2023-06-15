const path = require('path')
const { build } = require('vite')
const helpers = require('../helpers')

const env = process.env.NODE_ENV || 'production'

module.exports = function(pkg, environment, version) {
  const localAddonFilePath = helpers.getLocalAddonFilePath(pkg, environment, version, '')
  console.log('addon building', pkg, environment, version, 'in', env)

  const entry = path.join(localAddonFilePath, 'src/addon.js')
  const outDir = path.join(localAddonFilePath, 'build')
  console.log('addon building: entry', entry)
  console.log('addon building: out dir', outDir)

  // https://vitejs.dev/guide/build.html#library-mode
  return build({
    build: {
      outDir,
      lib: {
        entry,
        name: "addon",
        fileName: "addon",
        formats: ["cjs"],
      },
      emptyOutDir: true,
      rollupOptions: {
        // external: ['vue'],
        output: {
          assetFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'style.css')
              return 'addon.css'
          },
          // globals: {
          //   vue: 'Vue',
          // },
        },
      },
    },
  })
}
