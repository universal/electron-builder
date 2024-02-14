import { checkBuildRequestOptions, Platform, DIR_TARGET } from "app-builder-lib"
import { doMergeConfigs } from "app-builder-lib/out/util/config"
import { Arch } from "builder-util"
import { createYargs } from "electron-builder/out/builder"
import { createSelfSignedCert } from "electron-builder/out/cli/create-self-signed-cert"
import { assertThat } from "../helpers/fileAssert"

test("cli", async () => {
  // because these methods are internal
  const { configureBuildCommand, normalizeOptions } = require("electron-builder/out/builder")
  const yargs = createYargs()
  configureBuildCommand(yargs)

  function parse(input: string): any {
    const options = normalizeOptions(yargs.parse(input))
    checkBuildRequestOptions(options)
    return options
  }

  expect(parse("-owl --x64 --ia32"))
  expect(parse("-mwl --x64 --ia32"))

  expect(parse("--dir")).toMatchObject({ targets: Platform.current().createTarget(DIR_TARGET) })
  expect(parse("--mac --dir")).toMatchSnapshot()
  expect(parse("--x64 --dir")).toMatchObject({ targets: Platform.current().createTarget(DIR_TARGET, Arch.x64) })

  expect(parse("--ia32 --x64")).toMatchObject({ targets: Platform.current().createTarget(null, Arch.x64, Arch.ia32) })
  expect(parse("--linux")).toMatchSnapshot()
  expect(parse("--win")).toMatchSnapshot()
  expect(parse("-owl")).toMatchSnapshot()
  expect(parse("-l tar.gz:ia32")).toMatchSnapshot()
  expect(parse("-l tar.gz:x64")).toMatchSnapshot()
  expect(parse("-l tar.gz")).toMatchSnapshot()
  expect(parse("-w tar.gz:x64")).toMatchSnapshot()
  expect(parse("-p always -w --x64")).toMatchSnapshot()
  expect(parse("--prepackaged someDir -w --x64")).toMatchSnapshot()
  expect(parse("--project someDir -w --x64")).toMatchSnapshot()

  expect(parse("-c.compress=store -c.asar -c ./config.json")).toMatchObject({
    config: {
      asar: true,
      compress: "store",
      extends: "./config.json",
    },
  })
})

test.ifWindows("create-self-signed-cert", async () => {
  const certLocation = await createSelfSignedCert("test-publisher-foo-bar")
  assertThat(certLocation).isFile()
})

test("merge configurations", () => {
  const result = doMergeConfigs([
    {
      files: [
        {
          from: "dist/renderer",
        },
        {
          from: "dist/renderer-dll",
        },
      ],
    },
    {
      files: [
        {
          from: ".",
          filter: ["package.json"],
        },
        {
          from: "dist/main",
        },
      ],
    },
    {
      files: ["**/*", "!webpack", "!.*", "!config/jsdoc.json", "!package.*"],
    },
    {
      files: [
        {
          from: ".",
          filter: ["!docs"],
        },
      ],
    },
    {
      files: ["!private"],
    },
  ])

  // console.log("data: " + JSON.stringify(result, null, 2))
  expect(result).toMatchObject({
    directories: {
      output: "dist",
      buildResources: "build",
    },
    files: [
      {
        filter: ["package.json", "**/*", "!webpack", "!.*", "!config/jsdoc.json", "!package.*", "!docs", "!private"],
      },
      {
        from: "dist/main",
      },
      {
        from: "dist/renderer",
      },
      {
        from: "dist/renderer-dll",
      },
    ],
  })
})