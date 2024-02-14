import { createTargets, DIR_TARGET, Platform } from "electron-builder"
import { promises as fs } from "fs"
import { outputJson } from "fs-extra"
import * as path from "path"
import { app, appTwo, appTwoThrows, assertPack, linuxDirTarget, modifyPackageJson, packageJson, toSystemIndependentPath } from "./helpers/packTester"
import { ELECTRON_VERSION } from "./helpers/testConfig"
import { verifySmartUnpack } from "./helpers/verifySmartUnpack"
import { AsarFilesystem } from "app-builder-lib/src/asar/asar"

test(
  "build in the app package.json",
  appTwoThrows(
    { targets: linuxDirTarget },
    {
      projectDirCreated: it =>
        modifyPackageJson(
          it,
          data => {
            data.build = {
              productName: "bar",
            }
          },
          true
        ),
    }
  )
)

test(
  "relative index",
  appTwo(
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(
          projectDir,
          data => {
            data.main = "./index.js"
          },
          true
        ),
    }
  )
)

it.ifDevOrLinuxCi(
  "electron version from electron-prebuilt dependency",
  app(
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          outputJson(path.join(projectDir, "node_modules", "electron-prebuilt", "package.json"), {
            version: ELECTRON_VERSION,
          }),
          modifyPackageJson(projectDir, data => {
            delete data.build.electronVersion
            data.devDependencies = {}
          }),
        ]),
    }
  )
)

test.ifDevOrLinuxCi(
  "electron version from electron dependency",
  app(
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        Promise.all([
          outputJson(path.join(projectDir, "node_modules", "electron", "package.json"), {
            version: ELECTRON_VERSION,
          }),
          modifyPackageJson(projectDir, data => {
            delete data.build.electronVersion
            data.devDependencies = {}
          }),
        ]),
    }
  )
)

test.ifDevOrLinuxCi(
  "electron version from build",
  app(
    {
      targets: linuxDirTarget,
    },
    {
      projectDirCreated: projectDir =>
        modifyPackageJson(projectDir, data => {
          data.devDependencies = {}
          data.build.electronVersion = ELECTRON_VERSION
        }),
    }
  )
)

test(
  "www as default dir",
  appTwo(
    {
      targets: Platform.LINUX.createTarget(DIR_TARGET),
    },
    {
      projectDirCreated: projectDir => fs.rename(path.join(projectDir, "app"), path.join(projectDir, "www")),
    }
  )
)

test.ifLinuxOrDevMac("afterPack", () => {
  let called = 0
  return assertPack(
    "test-app-one",
    {
      targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
      config: {
        afterPack: () => {
          called++
          return Promise.resolve()
        },
      },
    },
    {
      packed: async () => {
        expect(called).toEqual(2)
      },
    }
  )
})

test.ifWindows("afterSign", () => {
  let called = 0
  return assertPack(
    "test-app-one",
    {
      targets: createTargets([Platform.LINUX, Platform.WINDOWS], DIR_TARGET),
      config: {
        afterSign: () => {
          called++
          return Promise.resolve()
        },
      },
    },
    {
      packed: async () => {
        // afterSign is only called when an app is actually signed and ignored otherwise.
        expect(called).toEqual(1)
      },
    }
  )
})

test.ifLinuxOrDevMac("beforeBuild", () => {
  let called = 0
  return assertPack(
    "test-app-one",
    {
      targets: createTargets([Platform.LINUX, Platform.MAC], DIR_TARGET),
      config: {
        npmRebuild: true,
        beforeBuild: async () => {
          called++
        },
      },
    },
    {
      packed: async () => {
        expect(called).toEqual(2)
      },
    }
  )
})

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifDevOrLinuxCi("win smart unpack", () => {
  // test onNodeModuleFile hook
  const nodeModuleFiles: Array<string> = []
  let p = ""
  return app(
    {
      targets: Platform.WINDOWS.createTarget(DIR_TARGET),
      config: {
        npmRebuild: true,
        onNodeModuleFile: file => {
          const name = toSystemIndependentPath(path.relative(p, file))
          if (!name.startsWith(".") && !name.endsWith(".dll") && name.includes(".")) {
            nodeModuleFiles.push(name)
          }
        },
      },
    },
    {
      projectDirCreated: projectDir => {
        p = projectDir
        return packageJson(it => {
          it.dependencies = {
            debug: "3.1.0",
            "edge-cs": "1.2.1",
            "@electron-builder/test-smart-unpack": "1.0.0",
            "@electron-builder/test-smart-unpack-empty": "1.0.0",
          }
        })(projectDir)
      },
      packed: async context => {
        await verifySmartUnpack(context.getResources(Platform.WINDOWS))
        expect(nodeModuleFiles).toMatchSnapshot()
      },
    }
  )()
})

// https://github.com/electron-userland/electron-builder/issues/1738
test.ifDevOrLinuxCi(
  "posix smart unpack",
  app(
    {
      targets: linuxDirTarget,
      config: {
        // https://github.com/electron-userland/electron-builder/issues/3273
        // tslint:disable-next-line:no-invalid-template-strings
        copyright: "Copyright © 2018 ${author}",
        npmRebuild: true,
        onNodeModuleFile: filePath => {
          // Force include this directory in the pakage
          return filePath.includes("node_modules/three/examples")
        },
        files: [
          // test ignore pattern for node_modules defined as file set filter
          {
            filter: ["!node_modules/napi-build-utils/napi-build-utils-1.0.0.tgz", "!node_modules/node-abi/*"],
          },
        ],
      },
    },
    {
      projectDirCreated: packageJson(it => {
        it.dependencies = {
          debug: "4.1.1",
          "edge-cs": "1.2.1",
          "lzma-native": "8.0.6",
          keytar: "7.9.0",
          three: "0.160.0",
        }
      }),
      packed: async context => {
        expect(context.packager.appInfo.copyright).toBe("Copyright © 2018 Foo Bar")
        await verifySmartUnpack(context.getResources(Platform.LINUX), async (asarFs: AsarFilesystem) => {
          return expect(await asarFs.readFile(`node_modules${path.sep}three${path.sep}examples${path.sep}fonts${path.sep}README.md`)).toMatchSnapshot()
        })
      },
    }
  )
)
